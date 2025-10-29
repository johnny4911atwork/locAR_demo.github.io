import * as THREE from "https://esm.sh/three";
import * as LocAR from 'https://esm.sh/locar';

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('glscene')
});
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

const locar = new LocAR.LocationBased(scene, camera);

const cam = new LocAR.Webcam({ 
    video: { facingMode: 'environment' }
}, null);

cam.on("webcamstarted", ev => {
    scene.background = ev.texture;
});

cam.on("webcamerror", error => {
    alert(`Webcam error: ${error.code}`);
});

let deviceOrientationControls = new LocAR.DeviceOrientationControls(camera);

deviceOrientationControls.on("deviceorientationgranted", ev => {
    ev.target.connect();
});

deviceOrientationControls.on("deviceorientationerror", error => {
    alert(`Device orientation error: ${error.code}`);
});

deviceOrientationControls.init();

window.addEventListener("resize", ev => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// GPS 追蹤狀態
let lastUpdateLon = null;
let lastUpdateLat = null;
const UPDATE_THRESHOLD_METERS = 1.1;
let firstLocation = true;

// 儲存當前的格子 - key 是實際經緯度字串
const gridCells = new Map();

// 網格配置
const GRID_PRECISION = 4; // 小數點後幾位 (4 = 0.0001 度 ≈ 11米)
const GRID_RANGE = 3; // 顯示周圍多少格

// 計算兩個 GPS 座標之間的距離（米）
function calculateDistance(lon1, lat1, lon2, lat2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// 將經緯度對齊到網格點
function snapToGrid(value, precision) {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
}

// 創建單個格子
function createGridCell() {
    const size = 8;
    const geom = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}

// 更新對齊到經緯度格點的網格
function updateAlignedGrid(userLon, userLat) {
    console.log(`User at: ${userLon.toFixed(6)}, ${userLat.toFixed(6)}`);

    // 找到用戶所在的網格點
    const centerLon = snapToGrid(userLon, GRID_PRECISION);
    const centerLat = snapToGrid(userLat, GRID_PRECISION);

    console.log(`Snapped to: ${centerLon.toFixed(6)}, ${centerLat.toFixed(6)}`);

    const gridStep = 1 / Math.pow(10, GRID_PRECISION); // 每格的度數
    const requiredCells = new Set();

    const added = [];

    // 生成周圍的網格點
    for (let latStep = -GRID_RANGE; latStep <= GRID_RANGE; latStep++) {
        for (let lonStep = -GRID_RANGE; lonStep <= GRID_RANGE; lonStep++) {
            const gridLon = centerLon + (lonStep * gridStep);
            const gridLat = centerLat + (latStep * gridStep);

            // 用精確到小數點的經緯度作為 key
            const key = `${gridLon.toFixed(GRID_PRECISION)},${gridLat.toFixed(GRID_PRECISION)}`;
            requiredCells.add(key);

            // 如果這個網格點還沒有格子,創建它
            if (!gridCells.has(key)) {
                const mesh = createGridCell();
                locar.add(mesh, gridLon, gridLat);

                gridCells.set(key, {
                    mesh: mesh,
                    lon: gridLon,
                    lat: gridLat
                });

                added.push(key);
            }
        }
    }

    // 移除太遠的格子
    const removed = [];
    for (const [key, cellData] of gridCells.entries()) {
        if (!requiredCells.has(key)) {
            scene.remove(cellData.mesh);
            cellData.mesh.geometry.dispose();
            cellData.mesh.material.dispose();
            gridCells.delete(key);
            removed.push(key);
        }
    }

    if (added.length) console.log(`Added ${added.length} cell(s):`, added);
    if (removed.length) console.log(`Removed ${removed.length} cell(s):`, removed);

    console.log(`Grid now has ${gridCells.size} cells (${Math.pow(GRID_RANGE * 2 + 1, 2)} expected)`);

    return { centerLon, centerLat, added, removed };
}

// GPS 更新處理
locar.on("gpserror", error => {
    alert(`GPS error: ${error.code}`);
});

locar.on("gpsupdate", ev => {
    const lon = ev.position.coords.longitude;
    const lat = ev.position.coords.latitude;
    
    // 第一次獲取位置
    if (firstLocation) {
        alert(`GPS 啟動!\n經度: ${lon.toFixed(6)}\n緯度: ${lat.toFixed(6)}\n網格精度: ${GRID_PRECISION} 位`);
        const res = updateAlignedGrid(lon, lat);
        lastUpdateLon = lon;
        lastUpdateLat = lat;
        firstLocation = false;
        console.log(`Initial grid centered at ${res.centerLon.toFixed(6)}, ${res.centerLat.toFixed(6)}`);
        return;
    }

    // 計算移動距離
    const distance = calculateDistance(lastUpdateLon, lastUpdateLat, lon, lat);

    // 移動超過閾值才更新
    if (distance > UPDATE_THRESHOLD_METERS) {
        console.log(`Moved ${distance.toFixed(2)}m - updating grid`);
        const res = updateAlignedGrid(lon, lat);
        console.log(`Moved from ${lastUpdateLon.toFixed(6)},${lastUpdateLat.toFixed(6)} to ${lon.toFixed(6)},${lat.toFixed(6)}`);
        if (res.added.length) console.log('Added cells:', res.added);
        if (res.removed.length) console.log('Removed cells:', res.removed);
        lastUpdateLon = lon;
        lastUpdateLat = lat;
    }
});

locar.startGps();

// Fake GPS 功能
document.getElementById("setFakeLoc")?.addEventListener("click", e => {
    const fakeLon = parseFloat(document.getElementById("fakeLon").value);
    const fakeLat = parseFloat(document.getElementById("fakeLat").value);
    
    alert(`使用假 GPS: ${fakeLon}, ${fakeLat}`);

    locar.stopGps();

    // 記錄舊的中心（若有）
    const oldCenter = (lastUpdateLon !== null && lastUpdateLat !== null)
        ? `${lastUpdateLon.toFixed(6)},${lastUpdateLat.toFixed(6)}`
        : null;

    // 清空現有格子（並列出已移除的 key）
    const removedKeys = [];
    for (const [key, cellData] of gridCells.entries()) {
        scene.remove(cellData.mesh);
        cellData.mesh.geometry.dispose();
        cellData.mesh.material.dispose();
        removedKeys.push(key);
    }
    gridCells.clear();

    if (removedKeys.length) console.log('Cleared existing cells:', removedKeys);

    locar.fakeGps(fakeLon, fakeLat);
    const res = updateAlignedGrid(fakeLon, fakeLat);
    console.log(`Fake GPS moved${oldCenter ? ` from ${oldCenter}` : ''} to ${res.centerLon.toFixed(6)},${res.centerLat.toFixed(6)}`);
    if (res.added.length) console.log('Added cells after fake move:', res.added);
    if (res.removed.length) console.log('Removed cells after fake move:', res.removed);

    lastUpdateLon = fakeLon;
    lastUpdateLat = fakeLat;
});

// 動畫循環
renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    renderer.render(scene, camera);
}
