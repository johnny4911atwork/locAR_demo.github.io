import * as THREE from "https://esm.sh/three";
import * as LocAR from 'https://esm.sh/locar';

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0); // 眼睛高度

const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('glscene')
});
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

// Webcam 背景
const cam = new LocAR.Webcam({ 
    video: { facingMode: 'environment' }
}, null);

cam.on("webcamstarted", ev => {
    scene.background = ev.texture;
});

cam.on("webcamerror", error => {
    alert(`Webcam error: ${error.code}`);
});

// 設備方向控制
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

// 創建地面網格 - 純 Three.js
function createGroundGrid() {
    const size = 100;
    const divisions = 20;
    const grid = new THREE.GridHelper(size, divisions, 0x00ff00, 0x00ff00);
    grid.position.y = 0; // 地面高度
    scene.add(grid);
    console.log('Grid added');
    return grid;
}

// 創建參考物件 - 讓你知道方向和距離
function createReferenceObjects() {
    // 前方的方塊（不同距離）
    const distances = [5, 10, 15, 20, 30];
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    
    distances.forEach((dist, i) => {
        const geom = new THREE.BoxGeometry(2, 2, 2);
        const mat = new THREE.MeshBasicMaterial({ color: colors[i] });
        const cube = new THREE.Mesh(geom, mat);
        cube.position.set(0, 1, -dist); // z 負值 = 前方
        scene.add(cube);
    });
    
    // 四個方向的柱子
    const directions = [
        { pos: [10, 0, 0], color: 0xff0000, name: '東' },
        { pos: [-10, 0, 0], color: 0x00ff00, name: '西' },
        { pos: [0, 0, 10], color: 0x0000ff, name: '南' },
        { pos: [0, 0, -10], color: 0xffff00, name: '北' }
    ];
    
    directions.forEach(dir => {
        const geom = new THREE.CylinderGeometry(0.5, 0.5, 3, 8);
        const mat = new THREE.MeshBasicMaterial({ color: dir.color });
        const cylinder = new THREE.Mesh(geom, mat);
        cylinder.position.set(dir.pos[0], 1.5, dir.pos[2]);
        scene.add(cylinder);
        console.log(`${dir.name} 方向標記已加入`);
    });
    
    console.log('Reference objects added');
}

// 初始化場景
createGroundGrid();
createReferenceObjects();

// 可選：加入環境光讓場景更亮
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

console.log('Scene initialized with', scene.children.length, 'objects');

// 動畫循環
renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    renderer.render(scene, camera);
}

// Fake location 按鈕（可選）
document.getElementById("setFakeLoc")?.addEventListener("click", e => {
    alert("純 Three.js 版本不需要 GPS！物件已經用相對座標固定了");
});
