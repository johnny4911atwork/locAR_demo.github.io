AFRAME.registerComponent('dynamic-grid', {
    init: function () {
        this.cameraEl = this.el; // 攝影機實體
        this.sceneEl = this.el.sceneEl; // 場景實體
        this.gridCount = 0; // 用於計數和命名，方便追蹤
        
        // 確保 AR.js 的 Location-Based 系統已初始化
        if (this.cameraEl.components['gps-new-camera']) {
            this.cameraEl.addEventListener('gps-camera-update-position', this.updateGrid.bind(this));
        } else {
            console.error("gps-new-camera 元件未找到或未初始化。");
        }
    },

    updateGrid: function (evt) {
        // GPS 更新資料在 evt.detail.position 中
        const currentLon = evt.detail.position.longitude;
        const currentLat = evt.detail.position.latitude;

        // 1. --- 清除所有舊的網格實體 ---
        // 我們使用 CSS 選擇器來找到所有名稱中包含 'dynamic-grid-box' 的實體
        const oldMeshes = this.sceneEl.querySelectorAll('[data-grid-id="dynamic-grid-box"]');
        oldMeshes.forEach(meshEl => {
            // 使用 A-Frame 的標準移除方法
            meshEl.parentNode.removeChild(meshEl);
        });

        // 2. --- 定義網格參數 (與之前 Three.js 邏輯相同) ---
        const gridDimension = 7; // 7x7 網格
        const gridSpacing = 0.00002; // 經緯度間距 (~2.2 公尺)
        const halfGrid = Math.floor(gridDimension / 2);

        // 3. --- 建立並放置新的方格 ---
        for (let i = -halfGrid; i <= halfGrid; i++) {
            for (let j = -halfGrid; j <= halfGrid; j++) {
                
                // 跳過使用者正下方的中心點
                if (i === 0 && j === 0) {
                    continue;
                }

                const lonDis = i * gridSpacing;
                const latDis = j * gridSpacing;

                // 創建一個新的 A-Frame 實體 (a-box)
                const gridEntity = document.createElement('a-box');
                
                // a-box 的預設旋轉是直立的，我們需要讓它平躺
                // x: 繞X軸旋轉 (-90 度 / -1.5708 弧度)
                // y: 繞Y軸旋轉 (0)
                // z: 繞Z軸旋轉 (0)
                gridEntity.setAttribute('rotation', '-90 0 0'); 
                
                // 設置外觀和尺寸 (寬2m, 高0.1m, 深2m)
                gridEntity.setAttribute('color', '#00ffff');
                gridEntity.setAttribute('width', '2');
                gridEntity.setAttribute('height', '0.1'); // 給一個薄度，使其像地磚
                gridEntity.setAttribute('depth', '2');
                
                // 設置標記，方便下次清除時找到它
                gridEntity.setAttribute('data-grid-id', 'dynamic-grid-box');

                // 設置 GPS 位置：這是 LocAR / AR.js 負責座標轉換的關鍵
                gridEntity.setAttribute('gps-entity-place', {
                    latitude: currentLat + latDis,
                    longitude: currentLon + lonDis
                });

                // 將實體添加到場景中
                this.sceneEl.appendChild(gridEntity);
                this.gridCount++;
            }
        }
    }
});

// 在開發環境中，可以添加一個手動 GPS 假定位按鈕
document.addEventListener('DOMContentLoaded', () => {
    const sceneEl = document.querySelector('a-scene');
    
    // 如果 AR.js 的假 GPS 函式存在，就添加一個按鈕
    if (sceneEl && sceneEl.components.arjs && sceneEl.components.arjs.controller.fakeGps) {
        
        // 為了簡單起見，我們不再添加按鈕，但在控制台中執行 fakeGps 即可測試
        console.log("提示：您可以在 console 中執行 scene.components.arjs.controller.fakeGps(經度, 緯度) 來測試。");
        
    } else {
        console.log("AR.js 未提供 fakeGps 函式。請使用真實的 GPS 數據測試。");
    }
});
