// AR.js 訊號格子主程式
class SignalGenerator {
    constructor() {
        this.baseStations = [
            { lat: 25.0330, lng: 121.5654, power: 100, name: '台北101' },
            { lat: 25.0478, lng: 121.5318, power: 95, name: '台北車站' },
            { lat: 25.0855, lng: 121.5606, power: 90, name: '圓山' },
            { lat: 24.9968, lng: 121.5417, power: 95, name: '信義區' },
            { lat: 25.0194, lng: 121.5419, power: 85, name: '大安區' },
            { lat: 25.0100, lng: 121.5300, power: 100, name: '中正區' },
            { lat: 25.0600, lng: 121.5800, power: 85, name: '內湖' },
            { lat: 25.0250, lng: 121.5750, power: 90, name: '南港' },
            { lat: 25.0050, lng: 121.5550, power: 95, name: '松山' },
            { lat: 25.0400, lng: 121.5500, power: 90, name: '中山' },
            { lat: 25.0322, lng: 121.5471, power: 100, name: '我這邊' },
        ];
        this.maxDistance = 0.02;
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const dLat = lat2 - lat1;
        const dLng = lng2 - lng1;
        return Math.sqrt(dLat * dLat + dLng * dLng);
    }
    getSignalStrength(lat, lng) {
        let totalSignal = 0, bestSignal = 0;
        for (const baseStation of this.baseStations) {
            const distance = this.calculateDistance(lat, lng, baseStation.lat, baseStation.lng);
            if (distance < this.maxDistance) {
                const normalizedDistance = distance / this.maxDistance;
                const signalContribution = baseStation.power * Math.pow(1 - normalizedDistance, 2);
                totalSignal += signalContribution * 0.4;
                bestSignal = Math.max(bestSignal, signalContribution);

                // 除錯訊息：輸出每個基站的計算過程
                console.log(`基站: ${baseStation.name}, 距離: ${distance.toFixed(7)}, 訊號貢獻: ${signalContribution.toFixed(2)}`);
            }
        }
        let baseSignal = bestSignal * 0.8 + totalSignal * 0.2;
        const finalSignal = Math.round(Math.min(100, Math.max(0, baseSignal)));

        // 除錯訊息：輸出最終的訊號強度
        console.log(`最終訊號強度: ${finalSignal}`);

        return finalSignal;
    }
    signalToColor(signal) {
        if (signal >= 80) return '#ff0000';
        if (signal >= 65) return '#ff4000';
        if (signal >= 50) return '#ff8000';
        if (signal >= 35) return '#ffbb00';
        if (signal >= 25) return '#ffff00';
        if (signal >= 15) return '#80ff00';
        if (signal >= 8) return '#00ff40';
        return '#0080ff';
    }
    // 只在用戶附近產生格子，遠方不顯示（格子數量減少，效能提升）
        // 每格約 1m x 1m，格子間距約 10m（cellSize = 0.0001 度）
        generateSignalGrid(centerLat, centerLng, gridSize = 15, cellSize = 0.0001) {
        const grid = [];
        const halfGrid = Math.floor(gridSize / 2);
        for (let x = -halfGrid; x <= halfGrid; x++) {
            for (let z = -halfGrid; z <= halfGrid; z++) {
                const lat = parseFloat((centerLat + (z * cellSize)).toFixed(7));
                const lng = parseFloat((centerLng + (x * cellSize)).toFixed(7));
                const signal = this.getSignalStrength(lat, lng);
                grid.push({
                    lat, lng, signal,
                    color: this.signalToColor(signal)
                });
            }
        }
        return grid;
    }
}

const signalGenerator = new SignalGenerator();

function showSignalGrid(centerLat, centerLng) {
    const grid = signalGenerator.generateSignalGrid(centerLat, centerLng);
    const scene = document.querySelector('a-scene');
    // 先清除舊格子
    document.querySelectorAll('.signal-cell').forEach(e => e.remove());

    // 除錯：在畫面與主控台顯示格子數與前幾個座標，方便在手機上確認
    console.log(`生成格子數量: ${grid.length}`);
    const statusEl = document.getElementById('status');
    if (statusEl) {
        const sample = grid.slice(0, 5).map(c => `(${c.lat.toFixed(7)},${c.lng.toFixed(7)}:${c.signal}%)`).join(' | ');
        statusEl.textContent = `目前位置：緯度 ${centerLat.toFixed(6)}, 經度 ${centerLng.toFixed(6)} ；格子: ${grid.length}；樣本: ${sample}`;
    }
    grid.forEach(cell => {
        // 產生格子
            const box = document.createElement('a-box');
            box.setAttribute('gps-entity-place', `latitude: ${cell.lat}; longitude: ${cell.lng};`);
            box.setAttribute('width', '1');
            box.setAttribute('height', '0.2');
            box.setAttribute('depth', '1');
            box.setAttribute('color', cell.color);
            box.setAttribute('opacity', '0.7');
            box.setAttribute('class', 'signal-cell');
            scene.appendChild(box);
        // 產生訊號強度文字
        const text = document.createElement('a-text');
        text.setAttribute('gps-entity-place', `latitude: ${cell.lat}; longitude: ${cell.lng};`);
        text.setAttribute('value', cell.signal + '%');
        text.setAttribute('align', 'center');
        text.setAttribute('color', '#222');
        text.setAttribute('scale', '2 2 2');
        text.setAttribute('class', 'signal-cell');
        scene.appendChild(text);
    });
}

// 取得定位後顯示格子
window.onload = function() {
    const statusElement = document.getElementById('status');

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(function(pos) {
            const latitude = pos.coords.latitude;
            const longitude = pos.coords.longitude;

            // 更新 #status 元素，顯示 GPS 位置
            statusElement.textContent = `目前位置：緯度 ${latitude.toFixed(6)}, 經度 ${longitude.toFixed(6)}`;

            // 顯示訊號格子
            showSignalGrid(latitude, longitude);
        }, function(error) {
            // 顯示錯誤訊息
            statusElement.textContent = `定位失敗：${error.message}`;
        }, { enableHighAccuracy: true, timeout: 8000 });
    } else {
        statusElement.textContent = '您的裝置不支援定位功能。';
        showSignalGrid(25.0330, 121.5654);
    }
};

