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
// 除錯開關：若為 true，followers 會用 BoxGeometry 並放大/抬高以便在測試時容易看到
const FOLLOWER_DEBUG = true;

// 產生 n 個在使用者附近的小物件（以緯經度偏移表示）
function createLocalFollowers(lon, lat, n = 8, radiusMeters = 3) {
    // 約略將公尺轉為緯經度差（在赤道附近）：1 度 ≈ 111320 m
    const meterToDeg = 1 / 111320;

    const geom = FOLLOWER_DEBUG ? new THREE.BoxGeometry(0.4, 0.4, 0.4) : new THREE.PlaneGeometry(0.5, 0.5);

    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const dx = Math.cos(angle) * radiusMeters; // 公尺
        const dy = Math.sin(angle) * radiusMeters; // 公尺

        const follower = new THREE.Mesh(
            geom,
            new THREE.MeshBasicMaterial({ color: 0x66ccff, side: THREE.DoubleSide })
        );
        follower.rotation.x = -Math.PI / 2; // 平面水平
        if (FOLLOWER_DEBUG) {
            // 抬高並微調旋轉，讓 box 在視線中更容易看到
            follower.position.y = 0.4;
            follower.rotation.x = 0; // 盒子不需要水平旋轉
        }

        // 計算偏移後的緯經度
        const lonOffset = dx * meterToDeg / Math.cos(lat * Math.PI / 180);
        const latOffset = dy * meterToDeg;

        const targetLon = lon + lonOffset;
        const targetLat = lat + latOffset;

        // 把 follower 加入 locar，並把參考存下來
        locar.add(follower, targetLon, targetLat);
        localFollowers.push({ mesh: follower, lonOffset, latOffset });
    }
    console.log(`createLocalFollowers: created ${localFollowers.length} followers (debug=${FOLLOWER_DEBUG})`);
}

// 重新定位所有 followers（當使用者位置改變或需要重新對齊時呼叫）
function updateLocalFollowers(originLon, originLat) {
    for (const f of localFollowers) {
        const lon = originLon + f.lonOffset;
        const lat = originLat + f.latOffset;
        // 嘗試使用 locar 的移除（如果有），否則從 scene 移除，再用 locar.add 重新加入以更新位置
        try {
            if (typeof locar.remove === 'function') {
                locar.remove(f.mesh);
            } else {
                scene.remove(f.mesh);
            }
        } catch (e) {
            // ignore
            scene.remove(f.mesh);
        }

        // 重新加入到 locar（locar 會處理 lat/lon -> world 轉換）
        if (typeof locar.add === 'function') {
            locar.add(f.mesh, lon, lat);
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
        console.log('Initial followers created:', localFollowers.length);
        
        firstLocation = false;
    }
    // 每次 gps 更新都嘗試把 followers 重新對齊到使用者附近
    if (localFollowers.length > 0) {
        updateLocalFollowers(ev.position.coords.longitude, ev.position.coords.latitude);
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
