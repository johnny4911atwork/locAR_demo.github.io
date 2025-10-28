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

// --- 關鍵點：不再需要這個陣列，我們直接操作 locar.children ---
// let currentGridMeshes = []; 
// ----------------------------------------------------

const gridGeom = new THREE.PlaneGeometry(2, 2);
const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide });

locar.on("gpserror", error => {
    alert(`GPS error: ${error.code}`);
});

locar.on("gpsupdate", ev => {
    if (firstLocation) {
        alert(`Got the initial location: longitude ${ev.position.coords.longitude}, latitude ${ev.position.coords.latitude}`);
        firstLocation = false;
    }

    // --- 最終解決方案：直接遍歷並移除 locar 的子物件 ---
    // 1. 儲存所有子物件的參考
    const childrenToRemove = [...locar.children];

    // 2. 遍歷並使用標準的 THREE.Group.remove() 機制
    for (const mesh of childrenToRemove) {
        // 從 locar (THREE.Group) 移除子物件
        locar.remove(mesh); 
        
        // 釋放 Three.js 資源 (可選，但推薦)
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    }
    // --------------------------------------------------------

    // 2. 獲取目前位置
    const coords = ev.position.coords;
    const currentLon = coords.longitude;
    const currentLat = coords.latitude;

    // 3. 定義新網格的參數
    const gridDimension = 7;
    const gridSpacing = 0.00002;
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
            
            // 讓方格平躺在地面上
            mesh.rotation.x = -Math.PI / 2; 

            // 使用 locar.add 將方格添加到 LocAR 系統
            // 由於 locar 是一個 THREE.Group 延伸，locar.add 其實就是 group.add
            locar.add(
                mesh,
                currentLon + lonDis,
                currentLat + latDis
            );
            
            // --- 不再需要將 mesh 加入追蹤陣列 ---
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
