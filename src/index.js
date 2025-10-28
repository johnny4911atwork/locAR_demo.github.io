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

// --- 新增 ---
// 1. 建立一個 Group 來管理所有的網格方塊，方便後續統一清除
const gridGroup = new THREE.Group();
scene.add(gridGroup);

// 2. 定義網格方塊的幾何體 (平面) 和材質
// 我們使用 2x2 公尺的平面
const gridGeom = new THREE.PlaneGeometry(2, 2);
// 使用亮藍色，並設定兩面可見
const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide });
// ----------------

locar.on("gpserror", error => {
    alert(`GPS error: ${error.code}`);
});

locar.on("gpsupdate", ev => {
    if (firstLocation) {
        alert(`Got the initial location: longitude ${ev.position.coords.longitude}, latitude ${ev.position.coords.latitude}`);
        firstLocation = false;
        // 我們不再需要在 'firstLocation' 裡做任何事，因為網格是動態更新的
    }

    // --- 修改 ---
    // 您的核心需求：持續追蹤並更新網格
    // 這個區塊的程式碼會在 *每一次* GPS 更新時執行

    // 1. 移除舊的方格 (實現「脫離範圍自動消失」)
    // 從 LocAR 系統中解除註冊
    gridGroup.children.forEach(child => {
        locar.remove(child);
    });
    // 從 Three.js 場景中移除
    gridGroup.clear();

    // 2. 獲取目前位置
    const coords = ev.position.coords;
    const currentLon = coords.longitude;
    const currentLat = coords.latitude;

    // 3. 定義新網格的參數
    // 建立一個 7x7 的網格 (奇數有助於讓使用者保持在中心)
    const gridDimension = 7;
    // 每個方格的間距 (經緯度)
    // 緯度 0.00001 度大約是 1.11 公尺。我們設定 0.00002 (~2.2 公尺)
    const gridSpacing = 0.00002; 
    
    const halfGrid = Math.floor(gridDimension / 2);

    // 4. 建立並放置新的方格
    for (let i = -halfGrid; i <= halfGrid; i++) {
        for (let j = -halfGrid; j <= halfGrid; j++) {
            
            // (可選) 不在使用者正下方 (0,0) 繪製方格
            if (i === 0 && j === 0) {
                continue;
            }

            const lonDis = i * gridSpacing;
            const latDis = j * gridSpacing;

            // 建立方格 Mesh
            const mesh = new THREE.Mesh(gridGeom, gridMaterial);

            // *** 重要 ***：將平面旋轉 90 度，使其平躺在地上
            mesh.rotation.x = -Math.PI / 2; // -90 度

            // 使用 locar.add 將方格添加到
            // (currentLon + lonDis, currentLat + latDis) 的地理位置
            locar.add(
                mesh,
                currentLon + lonDis,
                currentLat + latDis
                // LocAR.add 的第三個參數是海拔高度，預設為 0 (與使用者相同高度)，正好符合「腳下」的需求
            );

            // 將 mesh 添加到我們的管理群組中，以便下次更新時清除
            gridGroup.add(mesh);
        }
    }
    // ----------------
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
