import * as THREE from "https://esm.sh/three";
import * as LocAR from 'https://esm.sh/locar';

// 建立相機 (PerspectiveCamera)
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
// 將相機放在接近使用者眼睛的高度 (m)
camera.position.set(0, 1.6, 0);

// 建立 WebGL renderer，並指定要使用的 canvas 元素
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('glscene')
});
// 設定 renderer 的輸出大小為視窗大小
renderer.setSize(window.innerWidth, window.innerHeight);

// 建立場景 (Scene)
const scene = new THREE.Scene();

// 建立 LocAR 的定位式主控制器，傳入場景與相機
const locar = new LocAR.LocationBased(scene, camera);

// 建立攝影機背景 (Webcam) 物件，預設使用後方相機 (environment)
const cam = new LocAR.Webcam({ 
    video: { facingMode: 'environment' }
}, null);

// 當 webcam 啟動成功時，使用其產生的 texture 作為場景背景
cam.on("webcamstarted", ev => {
    scene.background = ev.texture;
});

// webcam 發生錯誤時顯示錯誤代碼
cam.on("webcamerror", error => {
    alert(`Webcam error: ${error.code}`);
});

// 建立裝置方向控制 (DeviceOrientationControls)，用於接收手機方向
let deviceOrientationControls = new LocAR.DeviceOrientationControls(camera);

// 使用者授權裝置方向事件 (部分瀏覽器需要使用者互動來授權)
deviceOrientationControls.on("deviceorientationgranted", ev => {
    // 連線到感測器或啟用控制
    ev.target.connect();
});

// 裝置方向相關錯誤處理
deviceOrientationControls.on("deviceorientationerror", error => {
    alert(`Device orientation error: ${error.code}`);
});

// 初始化裝置方向控制（準備開始接收事件）
deviceOrientationControls.init();

// 當視窗大小改變時，更新 renderer 與相機的長寬比
window.addEventListener("resize", ev => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// GPS 追蹤狀態
let lastUpdateLon = null;
let lastUpdateLat = null;
const UPDATE_THRESHOLD_METERS = 5;
let firstLocation = true;

// 儲存當前的格子 - key 是實際經緯度字串
const gridCells = new Map();

// 網格配置
const GRID_PRECISION = 4; // 小數點後幾位 (4 = 0.0001 度 ≈ 11米)
const GRID_RANGE = 5; // 顯示周圍多少格

// 假基地台資料 (台北市附近)
const BASE_STATIONS = [
    { name: "台北車站基地台", lon: 121.5170, lat: 25.0478, power: 100 },
    { name: "101大樓基地台", lon: 121.5654, lat: 25.0340, power: 120 },
    { name: "西門町基地台", lon: 121.5070, lat: 25.0420, power: 100 },
    { name: "測試基地台#1", lon: 121.5425, lat: 25.0330, power: 80 }
];

// 計算訊號強度 (根據距離衰減)
function calculateSignalStrength(gridLon, gridLat) {
    let maxSignal = 0;
    let nearestStation = null;
    
    // 找出訊號最強的基地台
    for (const station of BASE_STATIONS) {
        const distance = calculateDistance(gridLon, gridLat, station.lon, station.lat);
        
        // 訊號強度計算:基礎功率 - 距離衰減
        // 簡化模型: signal = power - (distance / 10)
        // 最大有效範圍約 1000 米
        let signal = station.power - (distance / 10);
        signal = Math.max(0, signal); // 不能是負數
        
        if (signal > maxSignal) {
            maxSignal = signal;
            nearestStation = station;
        }
    }
    
    return {
        strength: maxSignal,
        station: nearestStation,
        distance: nearestStation ? calculateDistance(gridLon, gridLat, nearestStation.lon, nearestStation.lat) : 0
    };
}

// 根據訊號強度取得顏色
function getColorForSignal(strength) {
    // strength 範圍: 0-100+
    // 紅色 (弱): 0-30
    // 橙色: 30-50
    // 黃色 (中): 50-70
    // 淺綠: 70-90
    // 綠色 (強): 90+
    
    if (strength >= 90) {
        return 0x00ff00; // 綠色 - 訊號強
    } else if (strength >= 70) {
        return 0x66ff00; // 淺綠
    } else if (strength >= 50) {
        return 0xffff00; // 黃色 - 訊號中等
    } else if (strength >= 30) {
        return 0xff9900; // 橙色
    } else if (strength >= 10) {
        return 0xff0000; // 紅色 - 訊號弱
    } else {
        return 0x660000; // 深紅色 - 幾乎無訊號
    }
}

// 計算兩個 GPS 座標之間的距離(米)
function calculateDistance(lon1, lat1, lon2, lat2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// 將經緯度對齊到網格點
function snapToGrid(value, precision) {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
}

// 創建單個格子
function createGridCell(lon, lat) {
    const size = 12;
    const geom = new THREE.PlaneGeometry(size, size);
    
    // 計算這個位置的訊號強度
    const signalInfo = calculateSignalStrength(lon, lat);
    const color = getColorForSignal(signalInfo.strength);
    
    const mat = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    
    // 在 mesh 上儲存訊號資訊供調試用
    mesh.userData = {
        signalStrength: signalInfo.strength.toFixed(2),
        nearestStation: signalInfo.station?.name || 'None',
        distance: signalInfo.distance.toFixed(0)
    };
    
    return mesh;
}

// 更新前端資訊顯示
function updateInfoPanel(lon, lat, centerLon, centerLat, gridCount) {
    document.getElementById('lon-value').textContent = lon.toFixed(6);
    document.getElementById('lat-value').textContent = lat.toFixed(6);
    document.getElementById('grid-point').textContent = `${centerLon.toFixed(GRID_PRECISION)}, ${centerLat.toFixed(GRID_PRECISION)}`;
    document.getElementById('grid-count').textContent = gridCount;
    
    // 計算當前位置的訊號強度
    const signalInfo = calculateSignalStrength(lon, lat);
    
    // 更新訊號強度顯示
    const strengthElement = document.getElementById('signal-strength');
    strengthElement.textContent = signalInfo.strength.toFixed(1);
    
    // 根據訊號強度改變顏色
    if (signalInfo.strength >= 90) {
        strengthElement.style.color = '#00ff00'; // 綠色
    } else if (signalInfo.strength >= 70) {
        strengthElement.style.color = '#66ff00'; // 淺綠
    } else if (signalInfo.strength >= 50) {
        strengthElement.style.color = '#ffff00'; // 黃色
    } else if (signalInfo.strength >= 30) {
        strengthElement.style.color = '#ff9900'; // 橙色
    } else if (signalInfo.strength >= 10) {
        strengthElement.style.color = '#ff0000'; // 紅色
    } else {
        strengthElement.style.color = '#660000'; // 深紅色
    }
    
    // 更新最近基地台資訊
    if (signalInfo.station) {
        document.getElementById('nearest-station').textContent = signalInfo.station.name;
        document.getElementById('station-distance').textContent = `${signalInfo.distance.toFixed(0)} 公尺`;
    } else {
        document.getElementById('nearest-station').textContent = '無訊號';
        document.getElementById('station-distance').textContent = '--';
    }
}

// 更新對齊到經緯度格點的網格
function updateAlignedGrid(userLon, userLat) {
    console.log(`使用者位置: ${userLon.toFixed(6)}, ${userLat.toFixed(6)}`);
    
    // 找到用戶所在的網格點
    const centerLon = snapToGrid(userLon, GRID_PRECISION);
    const centerLat = snapToGrid(userLat, GRID_PRECISION);
    
    console.log(`對齊到格點: ${centerLon.toFixed(6)}, ${centerLat.toFixed(6)}`);
    
    const gridStep = 1 / Math.pow(10, GRID_PRECISION); // 每格的度數
    const requiredCells = new Set();
    
    // 生成周圍的網格點
    for (let latStep = -GRID_RANGE; latStep <= GRID_RANGE; latStep++) {
        for (let lonStep = -GRID_RANGE; lonStep <= GRID_RANGE; lonStep++) {
            const gridLon = centerLon + (lonStep * gridStep);
            const gridLat = centerLat + (latStep * gridStep);
            
            // 用精確到小數點的經緯度作為 key
            const key = `${gridLon.toFixed(GRID_PRECISION)},${gridLat.toFixed(GRID_PRECISION)}`;
            requiredCells.add(key);
            
            // 如果這個網格點還沒有格子,創建它
            if (!gridCells.has(key)) {
                const mesh = createGridCell(gridLon, gridLat);
                locar.add(mesh, gridLon, gridLat);
                
                gridCells.set(key, {
                    mesh: mesh,
                    lon: gridLon,
                    lat: gridLat
                });
                
                console.log(`已新增格子: ${key}, 訊號強度: ${mesh.userData.signalStrength}, 最近基地台: ${mesh.userData.nearestStation}`);
            }
        }
    }
    
    // 移除太遠的格子
    for (const [key, cellData] of gridCells.entries()) {
        if (!requiredCells.has(key)) {
            scene.remove(cellData.mesh);
            cellData.mesh.geometry.dispose();
            cellData.mesh.material.dispose();
            gridCells.delete(key);
            console.log(`已移除格子: ${key}`);
        }
    }
    
    console.log(`目前網格有 ${gridCells.size} 個格子（預期 ${Math.pow(GRID_RANGE * 2 + 1, 2)} 個）`);
    
    // 更新前端顯示
    updateInfoPanel(userLon, userLat, centerLon, centerLat, gridCells.size);
}

// GPS 更新處理
locar.on("gpserror", error => {
    alert(`GPS error: ${error.code}`);
});

locar.on("gpsupdate", ev => {
    const lon = ev.position.coords.longitude;
    const lat = ev.position.coords.latitude;
    
    // 即時更新前端顯示的經緯度
    const centerLon = snapToGrid(lon, GRID_PRECISION);
    const centerLat = snapToGrid(lat, GRID_PRECISION);
    updateInfoPanel(lon, lat, centerLon, centerLat, gridCells.size);
    
    // 第一次獲取位置
    if (firstLocation) {
        alert(`GPS 啟動!\n經度: ${lon.toFixed(6)}\n緯度: ${lat.toFixed(6)}\n網格精度: ${GRID_PRECISION} 位`);
        updateAlignedGrid(lon, lat);
        lastUpdateLon = lon;
        lastUpdateLat = lat;
        firstLocation = false;
        return;
    }
    
    // 計算移動距離
    const distance = calculateDistance(lastUpdateLon, lastUpdateLat, lon, lat);
    
    // 移動超過閾值才更新網格
    if (distance > UPDATE_THRESHOLD_METERS) {
        console.log(`移動了 ${distance.toFixed(2)} 公尺，更新網格中`);
        updateAlignedGrid(lon, lat);
        lastUpdateLon = lon;
        lastUpdateLat = lat;
    }
});

locar.startGps();

// Fake GPS 功能
document.getElementById("setFakeLoc")?.addEventListener("click", e => {
    const fakeLon = parseFloat(document.getElementById("fakeLon").value);
    const fakeLat = parseFloat(document.getElementById("fakeLat").value);
    
    alert(`使用假 GPS: ${fakeLon}, ${fakeLat}`);
    
    locar.stopGps();
    
    // 清空現有格子
    for (const [key, cellData] of gridCells.entries()) {
        scene.remove(cellData.mesh);
        cellData.mesh.geometry.dispose();
        cellData.mesh.material.dispose();
    }
    gridCells.clear();
    
    locar.fakeGps(fakeLon, fakeLat);
    updateAlignedGrid(fakeLon, fakeLat);
    lastUpdateLon = fakeLon;
    lastUpdateLat = fakeLat;
});

// 動畫循環
renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    renderer.render(scene, camera);
}
