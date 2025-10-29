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
let isGridCreated = false;

// 創建固定的地面網格（只執行一次）
function createGroundGrid() {
    if (isGridCreated) return; // 防止重複創建
    
    const size = 50;
    const divisions = 10;
    const gridHelper = new THREE.GridHelper(size, divisions, 0x00ff00, 0x00ff00);
    
    gridHelper.material.opacity = 0.8;
    gridHelper.material.transparent = true;
    
    // 固定在世界座標的地面
    gridHelper.position.set(0, -1.5, 0);
    
    scene.add(gridHelper);
    groundPlane = gridHelper;
    isGridCreated = true;
    
    console.log('Ground grid created (once)');
}

// 創建基於 GPS 的標記
function createGPSMarkers(lon, lat) {
    // 清除舊標記
    scene.children.filter(child => child.userData.isGPSMarker).forEach(marker => {
        scene.remove(marker);
        marker.geometry?.dispose();
        marker.material?.dispose();
    });
    
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    const distances = [10, 20, 30, 40, 50];
    
    distances.forEach((dist, i) => {
        const geom = new THREE.BoxGeometry(5, 5, 5);
        const mat = new THREE.MeshBasicMaterial({ 
            color: colors[i],
            transparent: true,
            opacity: 0.8
        });
        const cube = new THREE.Mesh(geom, mat);
        cube.userData.isGPSMarker = true;
        
        // 在北方放置標記
        const latOffset = dist / 111320;
        locar.add(cube, lon, lat + latOffset);
        
        console.log(`Marker ${i} added at ${dist}m north`);
    });
    
    // 在當前位置也放一個標記
    const centerGeom = new THREE.SphereGeometry(3, 16, 16);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const centerMarker = new THREE.Mesh(centerGeom, centerMat);
    centerMarker.userData.isGPSMarker = true;
    locar.add(centerMarker, lon, lat);
    console.log(`Center marker at ${lon}, ${lat}`);
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
        alert(`Got location: ${lon.toFixed(6)}, ${lat.toFixed(6)}`);
        
        // 只在第一次創建網格
        createGroundGrid();
        createGPSMarkers(lon, lat);
        
        console.log('Setup complete');
        console.log('Camera:', camera.position);
        console.log('Scene objects:', scene.children.length);
        
        firstLocation = false;
        
        // 停止 GPS 更新,避免持續觸發
        locar.stopGps();
        console.log('GPS stopped to prevent flickering');
    }
});

locar.startGps();

document.getElementById("setFakeLoc")?.addEventListener("click", e => {
    alert("Using fake GPS");
    locar.stopGps();
    const fakeLon = parseFloat(document.getElementById("fakeLon").value);
    const fakeLat = parseFloat(document.getElementById("fakeLat").value);
    
    isGridCreated = false; // 重置
    createGroundGrid();
    createGPSMarkers(fakeLon, fakeLat);
});

renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    
    // 讓網格跟著相機移動（保持在腳下）
    if (groundPlane) {
        groundPlane.position.x = camera.position.x;
        groundPlane.position.z = camera.position.z;
    }
    
    renderer.render(scene, camera);
}
