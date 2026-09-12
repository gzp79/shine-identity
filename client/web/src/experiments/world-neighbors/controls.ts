import type GUI from 'lil-gui';
import type { DebugPanel } from '../../engine/compositor/debug-panel';

export type Params = {
    centerQ: number;
    centerR: number;
    showHexagons: boolean;
    showAllInterior: boolean;
    showInterior: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
    showAllEdges: boolean;
    showEdges: [boolean, boolean, boolean, boolean, boolean, boolean];
    showAllCorners: boolean;
    showCorners: [boolean, boolean, boolean, boolean, boolean, boolean];
};

export function defaultParams(): Params {
    return {
        centerQ: 0,
        centerR: 0,
        showHexagons: true,
        showAllInterior: true,
        showInterior: [true, true, true, true, true, true, true],
        showAllEdges: true,
        showEdges: [true, true, true, true, true, true],
        showAllCorners: true,
        showCorners: [true, true, true, true, true, true]
    };
}

function addToggleFolder(
    gui: GUI,
    title: string,
    values: boolean[],
    setAll: (v: boolean) => void,
    onDisplayChange: () => void
): void {
    const folder = gui.addFolder(title);
    folder.close();

    const allParam = { showAll: values.every((v) => v) };
    const allCtrl = folder.add(allParam, 'showAll').name('Show All');

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;padding:0 var(--padding);height:var(--widget-height);align-items:center;';

    const checkboxes = values.map((checked, i) => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.style.cssText = 'cursor:pointer;';
        checkbox.addEventListener('change', () => {
            values[i] = checkbox.checked;
            allParam.showAll = values.every((v) => v);
            setAll(allParam.showAll);
            allCtrl.updateDisplay();
            onDisplayChange();
        });
        const label = document.createElement('label');
        label.textContent = String(i);
        label.style.cssText = 'display:flex;gap:4px;align-items:center;cursor:pointer;';
        label.prepend(checkbox);
        row.appendChild(label);
        return checkbox;
    });

    (folder as unknown as { $children: HTMLElement }).$children.appendChild(row);

    allCtrl.onChange((value: boolean) => {
        values.fill(value);
        setAll(value);
        checkboxes.forEach((cb) => (cb.checked = value));
        onDisplayChange();
    });
}

export function createControls(
    debugPanel: DebugPanel,
    params: Params,
    onDisplayChange: () => void,
    onRegenerate: () => void
): void {
    const gui = debugPanel.root();

    const chunkFolder = gui.addFolder('Chunk');
    const qCtrl = chunkFolder.add(params, 'centerQ').name('Q').step(1).onFinishChange(onRegenerate);
    const rCtrl = chunkFolder.add(params, 'centerR').name('R').step(1).onFinishChange(onRegenerate);
    chunkFolder
        .add(
            {
                randomize: () => {
                    const range = 100;
                    params.centerQ = Math.floor(Math.random() * range * 2) - range;
                    params.centerR = Math.floor(Math.random() * range * 2) - range;
                    qCtrl.updateDisplay();
                    rCtrl.updateDisplay();
                    onRegenerate();
                }
            },
            'randomize'
        )
        .name('Random Chunk');

    gui.add(params, 'showHexagons').name('Show Hexagons').onChange(onDisplayChange);

    addToggleFolder(
        gui,
        'Interior Cells (0=Center, 1-6=Neighbors)',
        params.showInterior,
        (v) => (params.showAllInterior = v),
        onDisplayChange
    );
    addToggleFolder(gui, 'Boundary Corners', params.showCorners, (v) => (params.showAllCorners = v), onDisplayChange);
    addToggleFolder(gui, 'Boundary Edges', params.showEdges, (v) => (params.showAllEdges = v), onDisplayChange);
}
