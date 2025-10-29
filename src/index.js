import * as THREE from "https://esm.sh/three";
import * as LocAR from 'https://esm.sh/locar';

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('glscene')
});
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

// 使用 LocAR 的場景管理
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

let firstLocation = true;

// GPS 座標轉換輔助函數
function metersToLatDegrees(meters) {
    return meters / 111320;
}

function metersToLonDegrees(meters, latitude) {
    return meters / (111320 * Math.cos(latitude * Math.PI / 180));
}

// 根據 GPS 創建物件
function createGPSBasedObjects(userLon, userLat) {
    console.log(`Creating objects at GPS: ${userLon}, ${userLat}`);
    
    // 1. 在用戶位置放一個地面網格
    const groundGrid = new THREE.GridHelper(100, 20, 0x00ff00, 0x00ff00);
    groundGrid.position.y = 0;
    locar.add(groundGrid, userLon, userLat);
    console.log('Ground grid placed at user location');
    
    // 2. 在不同方向和距離放置標記物
    const markers = [
        { distance: 10, bearing: 0, color: 0xff0000, name: '北 10m' },
        { distance: 20, bearing: 0, color: 0xff3333, name: '北 20m' },
        { distance: 30, bearing: 0, color: 0xff6666, name: '北 30m' },
        { distance: 15, bearing: 90, color: 0x00ff00, name: '東 15m' },
        { distance: 15, bearing: 180, color: 0x0000ff, name: '南 15m' },
        { distance: 15, bearing: 270, color: 0xffff00, name: '西 15m' },
    ];
    
    markers.forEach(marker => {
        // 計算目標經緯度
        const bearingRad = marker.bearing * Math.PI / 180;
        const latOffset = metersToLatDegrees(marker.distance * Math.cos(bearingRad));
        const lonOffset = metersToLonDegrees(marker.distance * Math.sin(bearingRad), userLat);
        
        const targetLon = userLon + lonOffset;
        const targetLat = userLat + latOffset;
        
        // 創建視覺標記
        const geom = new THREE.BoxGeometry(3, 3, 3);
        const mat = new THREE.MeshBasicMaterial({ 
            color: marker.color,
            transparent: true,
            opacity: 0.9
        });
        const cube = new THREE.Mesh(geom, mat);
        
        // 用 LocAR 放置到 GPS 位置
        locar.add(cube, targetLon, targetLat);
        console.log(`${marker.name} placed at ${targetLon.toFixed(6)}, ${targetLat.toFixed(6)}`);
    });
    
    // 3. 在用戶位置放一個白色球標記「你在這裡」
    const userMarkerGeom = new THREE.SphereGeometry(2, 16, 16);
    const userMarkerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const userMarker = new THREE.Mesh(userMarkerGeom, userMarkerMat);
    locar.add(userMarker, userLon, userLat);
    console.log('User marker placed');
    
    console.log(`Total scene objects: ${scene.children.length}`);
}

// GPS 事件處理
locar.on("gpserror", error => {
    alert(`GPS error: ${error.code}`);
});

locar.on("gpsupdate", ev => {
    if (firstLocation) {
        const lon = ev.position.coords.longitude;
        const lat = ev.position.coords.latitude;
        
        alert(`GPS 定位成功!\n經度: ${lon.toFixed(6)}\n緯度: ${lat.toFixed(6)}`);
        
        // 創建所有物件
        createGPSBasedObjects(lon, lat);
        
        // 立即停止 GPS 更新,避免閃爍
        locar.stopGps();
        console.log('GPS stopped - objects fixed in place');
        
        firstLocation = false;
    }
});

// 啟動 GPS
locar.startGps();

// Fake GPS 功能
document.getElementById("setFakeLoc")?.addEventListener("click", e => {
    const fakeLon = parseFloat(document.getElementById("fakeLon").value);
    const fakeLat = parseFloat(document.getElementById("fakeLat").value);
    
    alert(`使用假 GPS: ${fakeLon}, ${fakeLat}`);
    
    locar.stopGps();
    locar.fakeGps(fakeLon, fakeLat);
    
    // 清空場景重新創建
    while(scene.children.length > 0) { 
        scene.remove(scene.children[0]); 
    }
    
    createGPSBasedObjects(fakeLon, fakeLat);
});

// 動畫循環
renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    renderer.render(scene, camera);
}
