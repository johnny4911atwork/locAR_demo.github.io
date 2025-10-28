import * as THREE from "https://esm.sh/three";
import * as LocAR from 'https://esm.sh/locar';

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);

const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('glscene')
});
renderer.setSize(window.innerWidth, window.innerHeight);
//document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const locar = new LocAR.LocationBased(scene, camera);

const cam = new LocAR.Webcam( { 
    video: { facingMode: 'environment' }
}, null);

cam.on("webcamstarted", ev => {
    scene.background = ev.texture;
});

cam.on("webcamerror", error => {
    alert(`Webcam error: code ${error.code} message ${error.message}`);
});

window.addEventListener("resize", ev => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

let firstLocation = true;

// GridManager: 在使用者周圍建立並維護 NxN 的格子（每格以 meters 為單位）
class GridManager {
    constructor(locar, scene, opts = {}) {
        this.locar = locar;
        this.scene = scene;
        this.gridSize = opts.gridSize || 3; // 必須為奇數，像 3,5
        if (this.gridSize % 2 === 0) this.gridSize += 1;
        this.cellSize = opts.cellSize || 5; // 每格大約幾公尺 (視視覺大小)
        this.cells = new Map(); // key: `${r}_${c}` => mesh
        this.lastCenter = null; // {lon, lat}
        // 共用 geometry (平面) — 旋轉為水平
        this.geom = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
        this.geom.rotateX(-Math.PI / 2);
    }

    // 大略把公尺轉成緯度度數
    metersToLat(m) {
        return m / 111320; // 平均值
    }

    // 大略把公尺轉成經度度數，需傳入參考緯度
    metersToLon(m, lat) {
        return m / (111320 * Math.cos(lat * Math.PI / 180));
    }

    // 產生一個可加入到 locar 的 mesh
    makeMesh(r, c) {
        const colour = 0x888888 + Math.floor(Math.random() * 0x777777);
        const mat = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
        const mesh = new THREE.Mesh(this.geom, mat);
        mesh.userData.grid = { r, c };
        return mesh;
    }

    // 更新格子中心位置 (centerLon, centerLat)
    update(centerLon, centerLat) {
        // 以中心緯度計算經度度數轉換
        const cellLatDeg = this.metersToLat(this.cellSize);
        const cellLonDeg = this.metersToLon(this.cellSize, centerLat);

        const half = Math.floor(this.gridSize / 2);
        const needed = new Set();

        for (let r = -half; r <= half; r++) {
            for (let c = -half; c <= half; c++) {
                const lat = centerLat + r * cellLatDeg;
                const lon = centerLon + c * cellLonDeg;
                const key = `${r}_${c}`;
                needed.add(key);
                if (!this.cells.has(key)) {
                    const mesh = this.makeMesh(r, c);
                    // 使用 locar.add 以便讓物件跟隨地理座標定位
                    this.locar.add(mesh, lon, lat);
                    this.cells.set(key, { mesh, lon, lat });
                } else {
                    // 可選：如果需要更新已有 mesh 的位置（通常不需）
                }
            }
        }

        // 移除不再需要的 cell
        for (const [key, val] of this.cells) {
            if (!needed.has(key)) {
                const mesh = val.mesh;
                // 從 scene/locar 移除並釋放資源
                try { this.scene.remove(mesh); } catch (e) { /* ignore */ }
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) {
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach(m => m.dispose());
                    } else {
                        mesh.material.dispose();
                    }
                }
                this.cells.delete(key);
            }
        }

        this.lastCenter = { lon: centerLon, lat: centerLat };
    }

    clear() {
        for (const [key, val] of this.cells) {
            const mesh = val.mesh;
            try { this.scene.remove(mesh); } catch (e) {}
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.cells.clear();
        this.lastCenter = null;
    }
}

let deviceOrientationControls = new LocAR.DeviceOrientationControls(camera);

deviceOrientationControls.on("deviceorientationgranted", ev => {
    ev.target.connect();
});

deviceOrientationControls.on("deviceorientationerror", error => {
    alert(`Device orientation error: code ${error.code} message ${error.message}`);
});

deviceOrientationControls.init();

locar.on("gpserror", error => {
    alert(`GPS error: ${error.code}`);
});

locar.on("gpsupdate", ev => {
    // 使用 GridManager 在使用者周圍建立 NxN 的格子，並在後續移動時更新
    if (firstLocation) {
        alert(`Got the initial location: longitude ${ev.position.coords.longitude}, latitude ${ev.position.coords.latitude}`);

        // 可調參數：gridSize (3 => 3x3, 5 => 5x5), cellSize (公尺)
        window._gridManager = new GridManager(locar, scene, { gridSize: 3, cellSize: 5 });
        window._gridManager.update(ev.position.coords.longitude, ev.position.coords.latitude);

        firstLocation = false;
        return;
    }

    // 後續 GPS 更新 — 若移動超過一格一半（或中心改變）則更新格子
    if (window._gridManager && window._gridManager.lastCenter) {
        const last = window._gridManager.lastCenter;
        const moved = distanceMeters(last.lat, last.lon, ev.position.coords.latitude, ev.position.coords.longitude);
        if (moved > (window._gridManager.cellSize / 2)) {
            window._gridManager.update(ev.position.coords.longitude, ev.position.coords.latitude);
        }
    }
});

// 計算兩個經緯度之間的距離（公尺），簡單 haversine
function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // m
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

locar.startGps();

document.getElementById("setFakeLoc").addEventListener("click", e => {
    alert("Using fake input GPS, not real GPS location");
    locar.stopGps();
    locar.fakeGps(
        parseFloat(document.getElementById("fakeLon").value),
        parseFloat(document.getElementById("fakeLat").value)
    );
});

renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    renderer.render(scene, camera);
}
