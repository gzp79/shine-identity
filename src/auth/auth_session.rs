use crate::auth::AuthSessionConfig;
use async_trait::async_trait;
use axum::{
    extract::FromRequestParts,
    http::request::Parts,
    response::{IntoResponse, IntoResponseParts, Response, ResponseParts},
    Extension, RequestPartsExt,
};
use axum_extra::extract::{
    cookie::{Cookie, Expiration, Key, SameSite},
    SignedCookieJar,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use shine_service::service::CurrentUser;
use std::{
    collections::hash_map::DefaultHasher,
    convert::Infallible,
    fmt,
    hash::{Hash, Hasher},
    sync::Arc,
};
use thiserror::Error as ThisError;
use time::{Duration, OffsetDateTime};
use url::Url;

#[derive(Clone, Debug, Hash, Serialize, Deserialize)]
pub(in crate::auth) struct ExternalLogin {
    #[serde(rename = "pv")]
    pub pkce_code_verifier: String,
    #[serde(rename = "cv")]
    pub csrf_state: String,
    #[serde(rename = "n")]
    pub nonce: Option<String>,
    #[serde(rename = "t")]
    pub target_url: Option<Url>,
    // indicates if login was made to link the account to the user of the given session
    #[serde(rename = "l")]
    pub linked_user: Option<CurrentUser>,
}

#[derive(Clone, Debug, Hash, Serialize, Deserialize)]
pub(in crate::auth) struct TokenLogin {
    #[serde(rename = "t")]
    pub token: String,
    #[serde(rename = "e")]
    pub expires: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Signature {
    #[serde(rename = "t")]
    signature: u64,
}

impl Signature {
    fn signature(
        secret: &Key,
        user: &Option<CurrentUser>,
        external_login: &Option<ExternalLogin>,
        token_login: &Option<TokenLogin>,
    ) -> u64 {
        let mut hasher = DefaultHasher::default();
        user.hash(&mut hasher);
        external_login.hash(&mut hasher);
        token_login.hash(&mut hasher);
        hasher.write(secret.master());
        hasher.finish()
    }

    fn new(
        secret: &Key,
        user: &Option<CurrentUser>,
        external_login: &Option<ExternalLogin>,
        token_login: &Option<TokenLogin>,
    ) -> Option<Self> {
        if user.is_some() || external_login.is_some() || token_login.is_some() {
            Some(Self {
                signature: Self::signature(secret, user, external_login, token_login),
            })
        } else {
            None
        }
    }

    fn validate(
        &self,
        secret: &Key,
        user: &Option<CurrentUser>,
        external_login: &Option<ExternalLogin>,
        token_login: &Option<TokenLogin>,
    ) -> bool {
        let hash = Self::signature(secret, user, external_login, token_login);
        self.signature == hash
    }
}

#[derive(Debug, ThisError)]
pub(in crate::auth) enum AuthSessionError {
    #[error("Missing or invalid domain for application home")]
    MissingHomeDomain,
    #[error("Invalid session secret: {0}")]
    InvalidSecret(String),
    #[error("Missing domain for auth scope")]
    MissingDomain,
    #[error("Auth api domain shall be a subdomain of the application")]
    InvalidApiDomain,
}

#[derive(Clone)]
struct CookieSettings {
    name: String,
    secret: Key,
    domain: String,
    path: String,
}

/// Layer to configure auth related cookie.
#[derive(Clone)]
pub(in crate::auth) struct AuthSessionMeta {
    user: CookieSettings,
    external_login: CookieSettings,
    token_login: CookieSettings,
    signature: CookieSettings,
}

impl AuthSessionMeta {
    pub fn new(home_url: Url, auth_base: Url, config: &AuthSessionConfig) -> Result<Self, AuthSessionError> {
        let cookie_name_suffix = config.cookie_name_suffix.as_deref().unwrap_or_default();
        let home_domain = home_url.domain().ok_or(AuthSessionError::MissingHomeDomain)?;
        let auth_domain = auth_base.domain().ok_or(AuthSessionError::MissingDomain)?.to_string();
        let auth_path = auth_base.path().to_string();

        log::info!("home_domain: {}", home_domain);
        log::info!("auth_domain: {}", auth_domain);
        log::info!("auth_path: {}", auth_path);

        if !auth_domain.ends_with(home_domain) {
            return Err(AuthSessionError::InvalidApiDomain);
        }

        let user_secret = {
            let key = B64
                .decode(&config.session_secret)
                .map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?;
            Key::try_from(&key[..]).map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?
        };
        let external_login_secret = {
            let key = B64
                .decode(&config.external_login_secret)
                .map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?;
            Key::try_from(&key[..]).map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?
        };
        let token_login_secret = {
            let key = B64
                .decode(&config.token_login_secret)
                .map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?;
            Key::try_from(&key[..]).map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?
        };
        let signature_secret = {
            let key = B64
                .decode(&config.signature_secret)
                .map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?;
            Key::try_from(&key[..]).map_err(|err| AuthSessionError::InvalidSecret(format!("{err}")))?
        };

        Ok(Self {
            user: CookieSettings {
                name: format!("sid{}", cookie_name_suffix),
                secret: user_secret,
                domain: home_domain.into(),
                path: "/".into(),
            },
            external_login: CookieSettings {
                name: format!("eid{}", cookie_name_suffix),
                secret: external_login_secret,
                domain: auth_domain.clone(),
                path: auth_path.clone(),
            },
            token_login: CookieSettings {
                name: format!("tid{}", cookie_name_suffix),
                secret: token_login_secret,
                domain: auth_domain.clone(),
                path: auth_path.clone(),
            },
            signature: CookieSettings {
                name: format!("sig{}", cookie_name_suffix),
                secret: signature_secret,
                domain: auth_domain,
                path: auth_path,
            },
        })
    }

    pub fn into_layer(self) -> Extension<Arc<Self>> {
        Extension(Arc::new(self))
    }
}

/// Handle all auth related cookie as an atomic entity. During authorization flow this
/// structure the consistency between the auth related cookie.
pub(in crate::auth) struct AuthSession {
    meta: Arc<AuthSessionMeta>,
    pub user: Option<CurrentUser>,
    pub external_login: Option<ExternalLogin>,
    pub token_login: Option<TokenLogin>,
}

impl AuthSession {
    fn empty(meta: Arc<AuthSessionMeta>) -> Self {
        Self {
            meta,
            user: None,
            external_login: None,
            token_login: None,
        }
    }

    fn new(
        meta: Arc<AuthSessionMeta>,
        user: Option<CurrentUser>,
        external_login: Option<ExternalLogin>,
        token_login: Option<TokenLogin>,
    ) -> Self {
        Self {
            meta,
            user,
            external_login,
            token_login,
        }
    }

    /// Return and clear all the components.
    pub fn take(&mut self) -> (Option<CurrentUser>, Option<ExternalLogin>, Option<TokenLogin>) {
        (self.user.take(), self.external_login.take(), self.token_login.take())
    }

    pub fn is_empty(&self) -> bool {
        self.user.is_none() && self.external_login.is_none() && self.token_login.is_none()
    }
}

impl fmt::Debug for AuthSession {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthSession")
            .field("user", &self.user)
            .field("external_login", &self.external_login)
            //.field("token_login", &self.token_login)
            .finish()
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthSession
where
    S: Send + Sync,
{
    type Rejection = Infallible;

    /// Extract component from the cookie header:
    /// - If a component is compromised, it is set to None
    /// - If there is no signature or it is not matching to the component, and empty result is returned        
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let Extension(meta) = parts
            .extract::<Extension<Arc<AuthSessionMeta>>>()
            .await
            .expect("Missing AuthSessionMeta extension");

        let signature = SignedCookieJar::from_headers(&parts.headers, meta.signature.secret.clone())
            .get(&meta.signature.name)
            .and_then(|session| serde_json::from_str::<Signature>(session.value()).ok());
        let user = SignedCookieJar::from_headers(&parts.headers, meta.user.secret.clone())
            .get(&meta.user.name)
            .and_then(|session| serde_json::from_str::<CurrentUser>(session.value()).ok());
        let external_login = SignedCookieJar::from_headers(&parts.headers, meta.external_login.secret.clone())
            .get(&meta.external_login.name)
            .and_then(|session| serde_json::from_str::<ExternalLogin>(session.value()).ok());
        let token_login = SignedCookieJar::from_headers(&parts.headers, meta.token_login.secret.clone())
            .get(&meta.token_login.name)
            .and_then(|session| serde_json::from_str::<TokenLogin>(session.value()).ok());

        log::info!(
            "Auth sessions from headers:\n  user:{:#?}\n  external_login:{:#?}\n  token_login:{:#?}\n  signature:{:#?}",
            user,
            external_login,
            token_login,
            signature
        );

        if let Some(signature) = signature {
            // if there is a signature accept session if all of them are consistent
            if signature.validate(&meta.signature.secret, &user, &external_login, &token_login) {
                Ok(Self::new(meta, user, external_login, token_login))
            } else {
                Ok(Self::empty(meta))
            }
        } else {
            // if there is no signature, only the token_login is considered as that has an extended lifetime
            if token_login.is_some() {
                Ok(Self::new(meta, None, None, token_login))
            } else {
                Ok(Self::empty(meta))
            }
        }
    }
}

fn create_jar<T: Serialize, X: Into<Expiration>>(
    settings: &CookieSettings,
    data: &Option<T>,
    expiration: X,
) -> SignedCookieJar {
    let mut cookie = if let Some(data) = data {
        let raw_data = serde_json::to_string(data).expect("Failed to serialize user");
        let mut cookie = Cookie::new(settings.name.clone(), raw_data);
        cookie.set_expires(expiration);
        cookie
    } else {
        let mut cookie = Cookie::named(settings.name.to_string());
        cookie.set_expires(OffsetDateTime::now_utc() - Duration::days(1));
        cookie
    };

    cookie.set_secure(true);
    cookie.set_domain(settings.domain.clone());
    cookie.set_path(settings.path.clone());
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path(settings.path.clone());
    SignedCookieJar::new(settings.secret.clone()).add(cookie)
}

impl IntoResponseParts for AuthSession {
    type Error = Infallible;

    /// Create set cookie header:
    /// - If a component is None, the cookie is deleted on the client side
    /// - If there is no component, all the cookies are deleted (including signature).
    fn into_response_parts(self, res: ResponseParts) -> Result<ResponseParts, Self::Error> {
        let Self {
            meta,
            user,
            external_login,
            token_login,
        } = self;
        let signature = Signature::new(&meta.signature.secret, &user, &external_login, &token_login);
        log::info!(
            "Auth sessions to set headers:\n  user:{:#?}\n  external_login:{:#?}\n  token_login:{:#?}\n  signatore:{:#?}",
            user,
            external_login,
            token_login,
            signature
        );

        let token_expiration = {
            let time = token_login.as_ref().map(|t| t.expires).unwrap_or(Utc::now());
            let naive_time = time.naive_utc();
            OffsetDateTime::from_unix_timestamp(naive_time.timestamp()).unwrap()
        };

        let user = create_jar(&meta.user, &user, Expiration::Session);
        let external_login = create_jar(&meta.external_login, &external_login, Expiration::Session);
        let token_login = create_jar(&meta.token_login, &token_login, token_expiration);
        let signature = create_jar(&meta.signature, &signature, Expiration::Session);

        Ok((user, external_login, token_login, signature)
            .into_response_parts(res)
            .unwrap())
    }
}

impl IntoResponse for AuthSession {
    fn into_response(self) -> Response {
        (self, ()).into_response()
    }
}