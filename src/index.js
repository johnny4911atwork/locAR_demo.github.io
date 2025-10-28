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
// 用來管理會跟著使用者移動的 local objects
const localFollowers = [];

// 產生 n 個在使用者附近的小物件（以緯經度偏移表示）
function createLocalFollowers(lon, lat, n = 8, radiusMeters = 3) {
    // 約略將公尺轉為緯經度差（在赤道附近）：1 度 ≈ 111320 m
    const meterToDeg = 1 / 111320;

    const geom = new THREE.PlaneGeometry(0.5, 0.5);

    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const dx = Math.cos(angle) * radiusMeters; // 公尺
        const dy = Math.sin(angle) * radiusMeters; // 公尺

        const follower = new THREE.Mesh(
            geom,
            new THREE.MeshBasicMaterial({ color: 0x66ccff, side: THREE.DoubleSide })
        );
        follower.rotation.x = -Math.PI / 2; // 平面水平

        // 計算偏移後的緯經度
        const lonOffset = dx * meterToDeg / Math.cos(lat * Math.PI / 180);
        const latOffset = dy * meterToDeg;

        const targetLon = lon + lonOffset;
        const targetLat = lat + latOffset;

        // 把 follower 加入 locar，並把參考存下來
        locar.add(follower, targetLon, targetLat);
        localFollowers.push({ mesh: follower, lonOffset, latOffset });
    }
}

// 重新定位所有 followers（當使用者位置改變或需要重新對齊時呼叫）
function updateLocalFollowers(originLon, originLat) {
    for (const f of localFollowers) {
        const lon = originLon + f.lonOffset;
        const lat = originLat + f.latOffset;
        // 假設 locar.add 可以用來更新已加入物件的位置；若不可行，需先移除再重新 add
        if (typeof locar.add === 'function') {
            locar.add(f.mesh, lon, lat);
        } else {
            // fallback: 直接操作 Three.js world 位置（若 locar 不支援）
            // 這裡不實作轉換，因為 locar 負責從 lat/lon 到 world 的轉換
        }
    }
}

// 移除特定 follower（傳入 mesh 或索引）
function removeLocalFollower(target) {
    let idx = -1;
    if (typeof target === 'number') idx = target;
    else idx = localFollowers.findIndex(f => f.mesh === target);

    if (idx >= 0 && idx < localFollowers.length) {
        const f = localFollowers[idx];
        // 先從 scene 移除
        scene.remove(f.mesh);
        // 釋放資源
        if (f.mesh.geometry) f.mesh.geometry.dispose?.();
        if (f.mesh.material) f.mesh.material.dispose?.();
        localFollowers.splice(idx, 1);
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
    if(firstLocation) {
        alert(`Got the initial location: longitude ${ev.position.coords.longitude}, latitude ${ev.position.coords.latitude}`);

        const boxProps = [{
            latDis: 0.0005,
            lonDis: 0,
            colour: 0xff0000
        }, {
            latDis: -0.0005,
            lonDis: 0,
            colour: 0xffff00
        }, {
            latDis: 0,
            lonDis: -0.0005,
            colour: 0x00ffff
        }, {
            latDis: 0,
            lonDis: 0.0005,
            colour: 0x00ff00
        }];

        const geom = new THREE.BoxGeometry(10,10,10);

        for(const boxProp of boxProps) {
            const mesh = new THREE.Mesh(
                geom, 
                new THREE.MeshBasicMaterial({color: boxProp.colour})
            );

            locar.add(
                mesh, 
                ev.position.coords.longitude + boxProp.lonDis, 
                ev.position.coords.latitude + boxProp.latDis
            );
        }

        // 建立靠近使用者的小型跟隨物件（例：8 個、半徑 3 公尺）
        createLocalFollowers(ev.position.coords.longitude, ev.position.coords.latitude, 8, 3);
        
        firstLocation = false;
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
