import {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';

const LATEST_KEY = 'latest.json';

/** Cache policy for the versioned, immutable bundle files. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** Cache policy for the mutable version pointer. */
const NO_CACHE = 'no-cache, no-store, must-revalidate';

const UPLOAD_CONCURRENCY = 8;
const DELETE_BATCH_SIZE = 1000;

const CONTENT_TYPES: Record<string, string> = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.map': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2'
};

type Options = {
    dir: string;
    bucket: string;
    version: string;
    dryRun: boolean;
};

function contentTypeOf(key: string): string {
    return CONTENT_TYPES[path.posix.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

function createClient(): S3Client {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!endpoint) {
        throw new Error('R2_ENDPOINT is not set.');
    }
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set.');
    }

    return new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey }
    });
}

async function listAllKeys(client: S3Client, bucket: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
        const response = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken })
        );
        for (const object of response.Contents ?? []) {
            if (object.Key) {
                keys.push(object.Key);
            }
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
}

/** Collect all files below `dir` as bucket keys relative to `dir`. */
async function listLocalKeys(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

async function getJson(client: S3Client, bucket: string, key: string): Promise<unknown | undefined> {
    try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await response.Body?.transformToString();
        return body ? JSON.parse(body) : undefined;
    } catch (e) {
        if (e instanceof NoSuchKey) {
            return undefined;
        }
        throw e;
    }
}

async function uploadAll(client: S3Client, options: Options, keys: string[]) {
    let next = 0;
    let done = 0;

    const worker = async () => {
        for (let index = next++; index < keys.length; index = next++) {
            const key = keys[index];
            if (!options.dryRun) {
                await client.send(
                    new PutObjectCommand({
                        Bucket: options.bucket,
                        Key: `${options.version}/${key}`,
                        Body: createReadStream(path.join(options.dir, key)),
                        ContentLength: (await fs.stat(path.join(options.dir, key))).size,
                        ContentType: contentTypeOf(key),
                        CacheControl: IMMUTABLE_CACHE
                    })
                );
            }
            console.log(`[${++done}/${keys.length}] Uploaded: ${key}`);
        }
    };

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, keys.length) }, worker));
}

async function deleteAll(client: S3Client, options: Options, keys: string[]) {
    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
        const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
        if (options.dryRun) {
            continue;
        }
        const response = await client.send(
            new DeleteObjectsCommand({
                Bucket: options.bucket,
                Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true }
            })
        );
        for (const error of response.Errors ?? []) {
            throw new Error(`Failed to delete ${error.Key}: ${error.Code} ${error.Message}`);
        }
    }
}

function versionOf(latest: unknown): string | undefined {
    if (latest === undefined) {
        return undefined;
    }
    const version = (latest as { version?: unknown }).version;
    if (typeof version !== 'string' || version.length === 0) {
        throw new Error(`Malformed ${LATEST_KEY}: missing version.`);
    }
    return version;
}

/**
 * Publish the local bundle folder under its own version prefix.
 *
 * `latest.json` is written last, which is the single step that makes the new version visible,
 * so a failure at any earlier step leaves the previously published version fully intact.
 */
async function deploy(client: S3Client, options: Options) {
    const localKeys = await listLocalKeys(options.dir);
    if (localKeys.length === 0) {
        throw new Error(`${options.dir} is empty.`);
    }

    console.log(`Deploying version ${options.version} from ${options.dir} (${localKeys.length} files).`);
    await uploadAll(client, options, localKeys);

    console.log(`Publishing ${LATEST_KEY} (version ${options.version})...`);
    if (!options.dryRun) {
        await client.send(
            new PutObjectCommand({
                Bucket: options.bucket,
                Key: LATEST_KEY,
                Body: JSON.stringify({ version: options.version }),
                ContentType: 'application/json',
                CacheControl: NO_CACHE
            })
        );
    }
    console.log('Deploy done.');
}

/** Remove every object that is not part of the published version. */
async function cleanup(client: S3Client, options: Options) {
    const version = versionOf(await getJson(client, options.bucket, LATEST_KEY));
    if (!version) {
        throw new Error(`No ${LATEST_KEY} in the bucket, refusing to clean up.`);
    }
    console.log(`Keeping version: ${version}`);

    const allKeys = await listAllKeys(client, options.bucket);
    console.log(`Bucket contains ${allKeys.length} objects.`);

    const obsolete = allKeys.filter((key) => key !== LATEST_KEY && !key.startsWith(`${version}/`));
    for (const key of obsolete) {
        console.log(`Deleting: ${key}`);
    }
    console.log(`Deleting ${obsolete.length} obsolete objects...`);
    await deleteAll(client, options, obsolete);
    console.log('Cleanup done.');
}

async function main() {
    const args = process.argv.slice(2);
    const command = args.find((arg) => !arg.startsWith('--'));
    const dirArg = args.find((arg) => arg.startsWith('--dir='));
    const versionArg = args.find((arg) => arg.startsWith('--version='));
    const bucket = process.env.R2_BUCKET;

    if (!bucket) {
        throw new Error('R2_BUCKET is not set.');
    }

    const version = versionArg ? versionArg.slice('--version='.length) : process.env.GITHUB_SHA;
    if (!version && command === 'deploy') {
        throw new Error('No version, pass --version=<v> or set GITHUB_SHA.');
    }

    const options: Options = {
        dir: dirArg ? dirArg.slice('--dir='.length) : path.join(__dirname, '../..', 'client/web/dist'),
        bucket,
        version: version ?? '',
        dryRun: args.includes('--dry-run')
    };

    if (options.dryRun) {
        console.log('Dry run: no object is created, replaced or deleted.');
    }

    const client = createClient();
    try {
        switch (command) {
            case 'deploy':
                await deploy(client, options);
                break;
            case 'cleanup':
                await cleanup(client, options);
                break;
            default:
                throw new Error(`Unknown command: ${command ?? '(none)'}, expected deploy or cleanup.`);
        }
    } finally {
        client.destroy();
    }
}

main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
