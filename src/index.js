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
let groundPlane = null;

// 創建一個簡單的地面網格,直接放在相機前方
function createGroundGrid() {
    // 移除舊的
    if (groundPlane) {
        scene.remove(groundPlane);
        groundPlane.geometry.dispose();
        groundPlane.material.dispose();
    }

    // 創建一個大的網格地面
    const size = 100;
    const divisions = 10;
    const gridHelper = new THREE.GridHelper(size, divisions, 0x00ff00, 0x00ff00);
    
    // 讓網格可見度更高
    gridHelper.material.opacity = 0.8;
    gridHelper.material.transparent = true;
    
    // 放在相機前方 10 米,下方 1.5 米 (假設相機在眼睛高度)
    gridHelper.position.set(0, -1.5, -10);
    
    scene.add(gridHelper);
    groundPlane = gridHelper;
    
    console.log('Ground grid created at:', gridHelper.position);
}

// 或者創建簡單的方塊標記
function createSimpleMarkers(lon, lat) {
    // 在用戶位置創建幾個彩色方塊
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
    const distances = [5, 10, 15, 20]; // 不同距離的標記
    
    distances.forEach((dist, i) => {
        const geom = new THREE.BoxGeometry(2, 2, 2);
        const mat = new THREE.MeshBasicMaterial({ color: colors[i] });
        const cube = new THREE.Mesh(geom, mat);
        
        // 在用戶北方不同距離放置
        const latOffset = dist / 111320; // 轉換米到度
        locar.add(cube, lon, lat + latOffset);
        
        console.log(`Added cube ${i} at distance ${dist}m`);
    });
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
    const lon = ev.position.coords.longitude;
    const lat = ev.position.coords.latitude;
    
    if (firstLocation) {
        alert(`Got location: ${lon}, ${lat}`);
        
        // 方法 1: 創建相機本地的網格 (不依賴 GPS 精度)
        createGroundGrid();
        
        // 方法 2: 創建基於 GPS 的標記
        createSimpleMarkers(lon, lat);
        
        console.log('Camera position:', camera.position);
        console.log('Scene children:', scene.children.length);
        
        firstLocation = false;
    }
});

locar.startGps();

document.getElementById("setFakeLoc").addEventListener("click", e => {
    alert("Using fake GPS");
    locar.stopGps();
    const fakeLon = parseFloat(document.getElementById("fakeLon").value);
    const fakeLat = parseFloat(document.getElementById("fakeLat").value);
    locar.fakeGps(fakeLon, fakeLat);
    createGroundGrid();
    createSimpleMarkers(fakeLon, fakeLat);
});

renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    renderer.render(scene, camera);
}
