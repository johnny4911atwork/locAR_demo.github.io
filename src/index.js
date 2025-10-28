import * as THREE from "https://esm.sh/three";
import * as LocAR from 'https://esm.sh/locar';

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);

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
    alert(`Webcam error: code ${error.code} message ${error.message}`);
});

window.addEventListener("resize", ev => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

let firstLocation = true;

let deviceOrientationControls = new LocAR.DeviceOrientationControls(camera);

deviceOrientationControls.on("deviceorientationgranted", ev => {
    ev.target.connect();
});

deviceOrientationControls.on("deviceorientationerror", error => {
    alert(`Device orientation error: code ${error.code} message ${error.message}`);
});

deviceOrientationControls.init();

// --- 修改 ---
// 1. 不再需要 gridGroup
// scene.add(gridGroup); // <- 移除

// 2. 定義網格方塊的幾何體 (平面) 和材質 (保持不變)
const gridGeom = new THREE.PlaneGeometry(2, 2);
const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide });
// ----------------

locar.on("gpserror", error => {
    alert(`GPS error: ${error.code}`);
});

locar.on("gpsupdate", ev => {
    if (firstLocation) {
        alert(`Got the initial location: longitude ${ev.position.coords.longitude}, latitude ${ev.position.coords.latitude}`);
        firstLocation = false;
    }

    // --- 重大修改 ---
    // 您的核心需求：持續追蹤並更新網格

    // 1. 移除所有舊的方格 (實現「脫離範圍自動消失」)
    // LocAR.LocationBased 繼承自 THREE.Group，所以我們可以直接呼叫 clear()
    locar.clear(); 
    // -----------------

    // 2. 獲取目前位置
    const coords = ev.position.coords;
    const currentLon = coords.longitude;
    const currentLat = coords.latitude;

    // 3. 定義新網格的參數
    const gridDimension = 7;
    const gridSpacing = 0.00002; // ~2.2 公尺
    const halfGrid = Math.floor(gridDimension / 2);

    // 4. 建立並放置新的方格
    for (let i = -halfGrid; i <= halfGrid; i++) {
        for (let j = -halfGrid; j <= halfGrid; j++) {
            
            if (i === 0 && j === 0) {
                continue;
            }

            const lonDis = i * gridSpacing;
            const latDis = j * gridSpacing;

            const mesh = new THREE.Mesh(gridGeom, gridMaterial);

            // 使用 locar.add 將方格添加到 LocAR 系統
            locar.add(
                mesh,
                currentLon + lonDis,
                currentLat + latDis
            );

            // --- 修改 ---
            // 5. 不再需要 gridGroup.add(mesh)
            // gridGroup.add(mesh); // <- 移除
            // -----------------
        }
    }
});

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
