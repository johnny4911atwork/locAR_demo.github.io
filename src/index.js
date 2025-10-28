// ====================================
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
            { lat: 25.0322, lng: 121.5471, power: 100, name: '我這邊' }
        ];
            let totalSignal = 0;
            let bestSignal = 0;
            for (const baseStation of this.baseStations) {
                const distance = this.calculateDistance(lat, lng, baseStation.lat, baseStation.lng);
                if (distance < this.maxDistance) {
                    const normalizedDistance = distance / this.maxDistance;
                    const contribution = baseStation.power * Math.pow(1 - normalizedDistance, 2);
                    totalSignal += contribution * 0.4;
                    bestSignal = Math.max(bestSignal, contribution);
                }
            }
            const baseSignal = bestSignal * 0.8 + totalSignal * 0.2;
            return Math.round(Math.min(100, Math.max(0, baseSignal)));
        this.modeElement = document.getElementById('mode');
        this.loadingElement = document.getElementById('loading');
        
        // 控制按鈕
        this.toggleARButton = document.getElementById('toggleAR');
        this.resetViewButton = document.getElementById('resetView');
        this.toggleGridButton = document.getElementById('toggleGrid');
        
        // 鍵盤控制狀態
        this.keys = {
            w: false, a: false, s: false, d: false,
            shift: false
        };
        
        // 累積移動距離追蹤
        this.lastUpdatePosition = new THREE.Vector3(0, 1.7, 0);
        this.accumulatedDistance = 0;
        
        this.gridVisible = true;
        // 地面高度（世界座標），預設為 -0.5（可調整）
        this.groundY = -0.5;
        // 固定的網格中心（地理座標），在進入 AR 時設定，網格會以此為世界錨點
        this.gridCenter = null;
        this.init();
    }

    /**
     * 初始化應用程式
     */
    async init() {
        try {
            console.log('開始初始化 AR 訊號強度檢測器...');
            
            // 檢查 THREE.js 是否載入
            if (typeof THREE === 'undefined') {
                throw new Error('THREE.js 未正確載入');
            }
            
            this.updateStatus('正在設定 3D 環境...');
            await this.setupThreeJS();
            
            this.updateStatus('正在檢查 AR 支援...');
            await this.checkARSupport();
            
            this.updateStatus('正在獲取位置資訊...');
            await this.getLocation();
            
            this.updateStatus('正在設定控制器...');
            this.setupEventListeners();
            this.setupKeyboardControls();
            
            this.updateStatus('正在生成訊號視覺化...');
            this.createSignalVisualization();
            
            this.updateStatus('啟動動畫引擎...');
            this.animate();

            // 初始化 debug overlay（方便在裝置上觀察狀態）
            try { this.initDebugOverlay(); } catch (e) { console.warn('initDebugOverlay 失敗', e); }
            
            this.updateStatus('初始化完成！使用 WASD 和滑鼠探索訊號強度');
            this.hideLoading();
            // 標記已初始化，並通知外部 UI：應用程式初始化完成，可以顯示啟動按鈕
            try {
                this.isInitialized = true;
            } catch (e) { /* ignore */ }
            try {
                const readyEvent = new CustomEvent('arapp:ready', { detail: { success: true } });
                window.dispatchEvent(readyEvent);
            } catch (e) { /* ignore */ }
            console.log('AR 訊號強度檢測器初始化成功！');
        } catch (error) {
            console.error('初始化失敗:', error);
            this.updateStatus('初始化失敗: ' + error.message);
            
            // 顯示詳細錯誤信息
            setTimeout(() => {
                alert('應用程式初始化失敗：\n' + error.message + '\n\n請重新整理頁面再試一次。');
            }, 1000);
        }
    }

    /**
     * 設定 Three.js 場景
     */
    async setupThreeJS() {
        console.log('開始設定 Three.js...');
        
        // 檢查 THREE 是否可用
        if (typeof THREE === 'undefined') {
            throw new Error('THREE.js 庫未載入');
        }
        
        // 創建場景
        console.log('創建場景...');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011); // 深藍色背景

        // 創建相機
        console.log('創建相機...');
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.camera.position.set(0, 1.7, 0); // 人眼高度，站在原點

        // 創建渲染器
        console.log('創建渲染器...');
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // 若為行動裝置，降低 pixel ratio 並關閉陰影以節省資源
        const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 480;
        if (isMobileDevice) {
            this.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1));
            try { this.renderer.shadowMap.enabled = false; } catch (e) { /* ignore */ }
        } else {
            this.renderer.setPixelRatio(window.devicePixelRatio);
            try { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch (e) { /* ignore */ }
        }
        
    // 我們改為使用 A-Frame / AR.js 的 location-based AR，不啟用 WebXR renderer
    try { this.renderer.xr.enabled = false; } catch (e) { /* ignore if not supported */ }
    console.log('使用 A-Frame / AR.js (location-based)，已關閉 WebXR 渲染器設定');
        // 調整 renderer DOM 樣式以支援 video 背景（location-based fallback）
        try {
            this.renderer.domElement.style.position = 'fixed';
            this.renderer.domElement.style.left = '0';
            this.renderer.domElement.style.top = '0';
            this.renderer.domElement.style.width = '100%';
            this.renderer.domElement.style.height = '100%';
            this.renderer.domElement.style.zIndex = '1'; // 放在 video 之上
            this.renderer.domElement.style.pointerEvents = 'none';
        } catch (e) { /* ignore */ }
        
        // 將渲染器添加到 DOM
        document.body.appendChild(this.renderer.domElement);

        // 添加環境光
        console.log('添加燈光...');
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        // 添加方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // 設定第一人稱攝影機控制
        console.log('設定第一人稱控制器...');
        this.setupFirstPersonControls();

        console.log('Three.js 設定完成');
    }

    /**
     * 檢查 AR 支援
     */
    async checkARSupport() {
        // 檢查瀏覽器是否支援 WebXR AR
        // 提前定義一些輔助函式（若尚未定義）
        function loadScript(url, timeout = 10000) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                let timer = null;
                s.src = url;
                s.async = true;
                s.onload = () => {
                    if (timer) clearTimeout(timer);
                    resolve();
                };
                s.onerror = (e) => {
                    if (timer) clearTimeout(timer);
                    reject(new Error('載入失敗: ' + url));
                };
                timer = setTimeout(() => {
                    s.onload = null;
                    s.onerror = null;
                    reject(new Error('載入逾時: ' + url));
                }, timeout);
                document.head.appendChild(s);
            });
        }

        function isIosSafariLike() {
            const ua = navigator.userAgent || '';
            // 判斷 iOS 裝置且使用 WebKit（含 iOS Safari / WKWebView）
            return /iP(hone|od|ad)/.test(ua) && /AppleWebKit/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua);
        }
        const tryCheck = async () => {
            try {
                // We no longer check for WebXR here; use location-based AR instead.
                this.isARSupported = true;
                this.updateMode('桌面模式 (Location AR 可用)');
                return;
            } catch (error) {
                console.warn('初次 WebXR 檢查失敗:', error);
                this.isARSupported = false;
                this.updateMode('桌面模式');
            }
        };

        // 先嘗試直接檢查
        await tryCheck();
        
        // 更新AR按鈕狀態
        if (this.toggleARButton) {
            this.toggleARButton.disabled = !this.isARSupported;
            this.toggleARButton.textContent = this.isARSupported ? '🚀 啟動AR' : '❌ AR不可用';
        }
    }

    /**
     * 獲取用戶位置並開始持續追蹤
     */
    async getLocation() {
        return new Promise((resolve) => {
            if (navigator.geolocation) {
                this.updateStatus('正在獲取GPS位置...');
                
                // 首先獲取當前位置
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.currentLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            name: '當前GPS位置'
                        };
                        this.updateLocation();
                        this.updateStatus('GPS位置獲取成功');
                        console.log(`📍 GPS: (${position.coords.latitude}, ${position.coords.longitude}), 精度: ${position.coords.accuracy}m`);
                        
                        // 開始持續追蹤GPS（用於AR模式）
                        this.startGPSTracking();
                        
                        resolve();
                    },
                    (error) => {
                        console.warn('GPS 獲取失敗:', error);
                        this.currentLocation = signalGenerator.getDefaultLocation();
                        this.currentLocation.accuracy = 0;
                        this.updateLocation();
                        this.updateStatus('使用預設位置 (GPS不可用)');
                        resolve();
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                );
            } else {
                this.currentLocation = signalGenerator.getDefaultLocation();
                this.currentLocation.accuracy = 0;
                this.updateLocation();
                this.updateStatus('使用預設位置 (不支援GPS)');
                resolve();
            }
        });
    }
    
    /**
     * 開始GPS持續追蹤（用於AR模式的實時定位）
     */
    startGPSTracking() {
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
        }
        
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                const newLat = position.coords.latitude;
                const newLng = position.coords.longitude;
                const accuracy = position.coords.accuracy;
                
                // 保存上一個位置以便計算 GPS-based heading
                if (!this._lastGPSPos) this._lastGPSPos = null;
                const prev = this._lastGPSPos;

                // 更新位置
                this.currentLocation = {
                    lat: newLat,
                    lng: newLng,
                    accuracy: accuracy,
                    name: '當前GPS位置'
                };

                // 更新 GPS 歷史（簡單保留上一筆）
                if (prev && (Math.abs(prev.lat - newLat) > 0 || Math.abs(prev.lng - newLng) > 0)) {
                    // 計算 bearing
                    this._gpsHeading = this.calculateBearing(prev.lat, prev.lng, newLat, newLng);
                    this._lastHeadingSource = 'gps';
                }
                this._lastGPSPos = { lat: newLat, lng: newLng, time: Date.now() };
                
                // 當 AR 模式啟用時，自動更新 A-Frame 或 three.js 的網格
                if (this.isARActive) {
                    console.log(`📍 GPS更新: (${newLat.toFixed(6)}, ${newLng.toFixed(6)}), 精度: ${accuracy.toFixed(1)}m`);
                    // 如果使用 A-Frame 場景（aframe-ar.js）顯示，重新建立 A-Frame 的 grid
                    const aframeScene = document.getElementById('aframeScene');
                    if (aframeScene && aframeScene.style.display !== 'none') {
                        // A-Frame 的實體會依據 GPS 綁定自動定位，但我們仍更新緩存
                        this.updateVisibleGrid(); // 更新 signalGrid cache
                        this.createAFrameGrid();
                    } else {
                        // 若是 camera overlay（three.js 在上層或同層），需把 three.js camera 移動到反映裝置實際位置
                        try {
                            // 三種情況：
                            // - 如果使用 A-Frame (aframeScene visible)：A-Frame 自行管理實體位置
                            // - 如果使用 camera overlay (three.js 顯示在畫面上)：將網格相對於當前裝置位置置放，camera 保持在原點
                            // 在此只更新 signalGrid，render loop 或 updateGridMesh 會利用 this.currentLocation 來計算相對位置
                            this.updateVisibleGrid();
                        } catch (e) { /* ignore update errors */ }
                    }
                    this.updateLocationDisplay();
                }
            },
            (error) => {
                console.warn('GPS追蹤錯誤:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 1000
            }
        );
        
        console.log('🛰️ GPS持續追蹤已啟動');
    }

    /**
     * 計算兩點之間的 bearing（方位角，度數）
     */
    calculateBearing(lat1, lon1, lat2, lon2) {
        // 來源: 基本的球面三角公式（以度為單位，回傳北方為0度，順時針為正）
        const toRad = (d) => d * Math.PI / 180;
        const toDeg = (r) => r * 180 / Math.PI;

        const φ1 = toRad(lat1);
        const φ2 = toRad(lat2);
        const λ1 = toRad(lon1);
        const λ2 = toRad(lon2);

        const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
        const θ = Math.atan2(y, x);
        let bearing = (toDeg(θ) + 360) % 360; // 0..360
        return bearing;
    }

    /**
     * 創建訊號視覺化
     */
    createSignalVisualization() {
        // 只移除舊的網格，保留燈光和其他必要物件
        if (this.gridMesh) {
            console.log('移除舊的網格');
            this.scene.remove(this.gridMesh);
            this.gridMesh.geometry.dispose();
            this.gridMesh.material.dispose();
            this.gridMesh = null;
        }
        
        // 移除可能存在的測試立方體（BoxGeometry）
        const objectsToRemove = [];
        this.scene.traverse((child) => {
            if (child.isMesh && child.geometry) {
                // 只移除BoxGeometry類型的物件（可能的測試立方體）
                if (child.geometry.type === 'BoxGeometry' || 
                    child.geometry.type === 'CubeGeometry') {
                    objectsToRemove.push(child);
                }
            }
        });
        
        objectsToRemove.forEach(obj => {
            console.log('移除立方體:', obj.geometry.type);
            this.scene.remove(obj);
        });

        // 生成固定的大範圍訊號網格（覆蓋台北市區域）
        this.createFixedSignalGrid();
        
        // 添加demo資訊顯示和地面
        this.createDemoInfo();
        this.createGroundPlane();
    }

    /**
     * 動態生成並緩存網格數據（無限地圖）
     */
    createFixedSignalGrid() {
        console.log('初始化無限地圖系統...');
        
        // 使用緩存機制，而不是預先生成所有網格
        this.gridCache = new Map(); // 緩存已生成的網格
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 480;
    this.cellSize = isMobile ? 0.0010 : 0.0005; // 手機約100米/格，桌面50米/格
        
        console.log('✅ 無限地圖系統已啟動');
        console.log('📍 網格將按需生成並永久緩存');
        
        // 初始渲染（顯示玩家周圍的網格）
        this.updateVisibleGrid();
    }
    
    /**
     * 獲取或生成指定GPS位置的網格數據（帶緩存）
     */
    getOrCreateGridCell(lat, lng) {
        // 標準化GPS座標（7位小數精度）
        const normalizedLat = parseFloat(lat.toFixed(7));
        const normalizedLng = parseFloat(lng.toFixed(7));
        const key = `${normalizedLat},${normalizedLng}`;
        
        // 檢查緩存
        if (this.gridCache.has(key)) {
            return this.gridCache.get(key);
        }
        
        // 生成新網格並緩存
        const signal = signalGenerator.getSignalStrength(normalizedLat, normalizedLng);
        const cell = {
            lat: normalizedLat,
            lng: normalizedLng,
            signal: signal,
            color: signalGenerator.signalToColor(signal)
        };
        
        this.gridCache.set(key, cell);
        return cell;
    }
    
    /**
     * 根據玩家位置生成周圍的網格（按需生成，永久緩存）
     */
    updateVisibleGrid() {
        const playerGPS = this.worldToGPS(this.camera.position);
        
        // 計算需要顯示的網格範圍（減少數量以提升效能和視覺清晰度）
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 480;
    const visibleGridRadius = isMobile ? 3 : 4; // 手機顯示 7x7 = 49 個網格
        
        // 計算網格的起始GPS座標（對齊到網格）
        const centerLat = this.currentLocation.lat;
        const centerLng = this.currentLocation.lng;
        
        // 計算玩家相對於地圖中心的網格索引
        const playerGridX = Math.round((playerGPS.lng - centerLng) / this.cellSize);
        const playerGridZ = Math.round((playerGPS.lat - centerLat) / this.cellSize);
        
        // 生成周圍網格
        this.signalGrid = [];
        for (let x = playerGridX - visibleGridRadius; x <= playerGridX + visibleGridRadius; x++) {
            for (let z = playerGridZ - visibleGridRadius; z <= playerGridZ + visibleGridRadius; z++) {
                const lat = centerLat + (z * this.cellSize);
                const lng = centerLng + (x * this.cellSize);
                
                // 獲取或創建網格（會自動緩存）
                const cell = this.getOrCreateGridCell(lat, lng);
                this.signalGrid.push(cell);
            }
        }
        
        const cacheSize = this.gridCache.size;
        console.log(`👁️ 顯示網格: ${this.signalGrid.length} | 📦 緩存總數: ${cacheSize} | 📍 玩家: (${playerGPS.lat.toFixed(5)}, ${playerGPS.lng.toFixed(5)})`);
        
        // 更新渲染
        // 使用節流避免過於頻繁地重建 InstancedMesh
        if (this._lastGridUpdateTime && (Date.now() - this._lastGridUpdateTime) < 300) {
            // 略過本次更新
            return;
        }
        this._lastGridUpdateTime = Date.now();
        this.updateGridMesh();
    }

    /**
     * 將3D世界座標轉換為GPS座標（確保精度一致）
     */
    worldToGPS(worldPos) {
        // 將3D世界座標轉換為GPS座標
        // 假設每100個3D單位 = 1公里 = 0.009度緯度
        const scaleToKm = 100; // 3D單位到公里的比例
        const kmToDegree = 0.009; // 1公里約等於0.009度
        
        const deltaLatKm = -worldPos.z / scaleToKm; // Z軸負方向為北
        const deltaLngKm = worldPos.x / scaleToKm;  // X軸正方向為東
        
        const deltaLat = deltaLatKm * kmToDegree;
        const deltaLng = deltaLngKm * kmToDegree;
        
        // 四捨五入到7位小數，確保精度一致
        return {
            lat: parseFloat((this.currentLocation.lat + deltaLat).toFixed(7)),
            lng: parseFloat((this.currentLocation.lng + deltaLng).toFixed(7))
        };
    }
    
    /**
     * 查詢指定GPS位置的網格數據（用於驗證一致性）
     */
    queryGridAtGPS(lat, lng) {
        const cell = this.getOrCreateGridCell(lat, lng);
        console.log(`📍 GPS(${lat}, ${lng}):`, cell);
        console.log(`   訊號強度: ${cell.signal}%`);
        console.log(`   顏色: 0x${cell.color.toString(16)}`);
        console.log(`   ${this.gridCache.has(`${lat.toFixed(7)},${lng.toFixed(7)}`) ? '✅ 已緩存' : '🆕 新生成'}`);
        return cell;
    }

    /**
     * 更新網格幾何體（渲染當前網格數據）
     */
    updateGridMesh() {
        // 使用 InstancedMesh 大幅提升性能：重用 geometry/material 並只更新 instance matrix 與顏色
        if (!this.signalGrid || this.signalGrid.length === 0) return;

        const size = 1.9; // 每格半寬
        const instanceCount = this.signalGrid.length;

        // 若尚未建立 instancedGrid 或容量不足，建立新的 InstancedMesh
        if (!this.instancedGrid || this.maxInstanced < instanceCount) {
            // 清理舊的
            try {
                if (this.instancedGrid) {
                    this.scene.remove(this.instancedGrid);
                    this.instancedGrid.geometry.dispose();
                    this.instancedGrid.material.dispose();
                }
            } catch (e) { /* ignore */ }

            // 使用平面幾何 (輕量) 並使用 MeshBasicMaterial（不受光源影響，性能友善）
            const geom = new THREE.PlaneGeometry(size * 2, size * 2);
            geom.rotateX(-Math.PI / 2); // 使平面朝上
            const mat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: false,
                side: THREE.DoubleSide
            });

            // 預留容量但限制最大值以保護行動裝置（行動裝置上限更低）
            const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 480;
            const maxCap = isMobile ? 80 : 128;
            const reserve = Math.max(32, Math.min(maxCap, Math.ceil(instanceCount * 1.1)));
            this.maxInstanced = reserve;
            this.instancedGrid = new THREE.InstancedMesh(geom, mat, this.maxInstanced);
            this.instancedGrid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

            // instanceColor 支援
            try {
                const colors = new Float32Array(this.maxInstanced * 3);
                this.instancedGrid.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
            } catch (e) {
                // 若不支援 instanceColor，退回不設色
                console.warn('InstancedMesh.instanceColor 不支援，將使用單色材質。', e);
            }

            // 啟用 frustum culling 讓 GPU 跳過畫面外的實例
            this.instancedGrid.frustumCulled = true;
            this.instancedGrid.renderOrder = 10;
            if (this.instancedGrid.material) this.instancedGrid.material.depthTest = false;

            this.scene.add(this.instancedGrid);
        }

        const dummyMatrix = new THREE.Matrix4();
        const tmpColor = new THREE.Color();
        // 決定 origin：若 A-Frame 場景可見（使用 gps-entity-place），使用 gridCenter；
        // 否則在 camera overlay 模式下，使用 currentLocation 作為 origin（使網格相對於裝置移動）
        let origin = { x: 0, z: 0 };
        try {
            const aframeScene = document.getElementById('aframeScene');
            if (aframeScene && aframeScene.style.display !== 'none') {
                if (this.gridCenter) origin = this.gpsToWorld(this.gridCenter.lat, this.gridCenter.lng);
            } else {
                if (this.currentLocation) origin = this.gpsToWorld(this.currentLocation.lat, this.currentLocation.lng);
            }
        } catch (e) { /* ignore */ }

        for (let i = 0; i < instanceCount; i++) {
            const cell = this.signalGrid[i];
            const worldPos = this.gpsToWorld(cell.lat, cell.lng);
            const x = worldPos.x - origin.x;
            const z = worldPos.z - origin.z;
            const y = (typeof this.groundY !== 'undefined' ? this.groundY : -0.5) + 0.04;

            dummyMatrix.makeTranslation(x, y, z);
            this.instancedGrid.setMatrixAt(i, dummyMatrix);

            if (this.instancedGrid.instanceColor) {
                tmpColor.set(cell.color);
                this.instancedGrid.instanceColor.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
            }
        }

        // 告知顏色/矩陣已更新
        try {
            this.instancedGrid.count = instanceCount;
            this.instancedGrid.instanceMatrix.needsUpdate = true;
            if (this.instancedGrid.instanceColor) this.instancedGrid.instanceColor.needsUpdate = true;
        } catch (e) { /* ignore */ }

        console.log('Instanced grid updated, instances:', instanceCount);
    }

    /**
     * 創建Demo資訊顯示
     */
    createDemoInfo() {
        // 設定固定的demo位置（可以改成任何地方）
        this.demoLocation = {
            lat: 25.032241,  // 台北市大安區
            lng: 121.547153,
            name: "台北市大安區 (Demo位置)"
        };
        
        // 在電腦demo模式下，使用固定位置而非GPS
        if (!this.isARActive) {
            this.currentLocation = this.demoLocation;
            this.updateLocationDisplay();
        }
        
        // 創建基站資訊顯示
        this.createBaseStationMarkers();
        this.updateNearestBaseStationInfo();
    }

    /**
     * 創建基站標記
     */
    createBaseStationMarkers() {
        // 清除舊的基站標記
        if (this.baseStationMarkers) {
            this.baseStationMarkers.forEach(marker => {
                this.scene.remove(marker);
            });
        }
        this.baseStationMarkers = [];

        // 設定基站可見距離（公里）
        this.baseStationVisibleDistance = 3; // 5公里內才顯示基站圖示

    // 為每個基站創建視覺標記
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 480;
    signalGenerator.baseStations.forEach((station, index) => {
            // 將GPS座標轉換為世界座標
            const worldPos = this.gpsToWorld(station.lat, station.lng);
            
            // 根據功率設定顏色
            let color, glowColor;
            if (station.power >= 80) {
                color = 0xff3333;      // 亮紅色 - 高功率
                glowColor = 0xff0000;  // 紅色光暈
            } else if (station.power >= 60) {
                color = 0xff8833;      // 橙色 - 中高功率
                glowColor = 0xff6600;  // 橙色光暈
            } else {
                color = 0xffaa33;      // 黃色 - 中低功率
                glowColor = 0xff9900;  // 黃色光暈
            }
            
            // 創建基站群組
            const baseStationGroup = new THREE.Group();
            if (isMobile) {
                // 手機上使用簡化標記：小球 + MeshBasicMaterial
                const baseGeometry = new THREE.SphereGeometry(0.4, 8, 8);
                const baseMaterial = new THREE.MeshBasicMaterial({ color: color });
                const base = new THREE.Mesh(baseGeometry, baseMaterial);
                base.position.y = 0.6;
                baseStationGroup.add(base);

                // 將 glow 設為簡單的圓盤（節省多邊形）
                const glowGeometry = new THREE.CircleGeometry(1.0, 8);
                const glowMaterial = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.12 });
                const glow = new THREE.Mesh(glowGeometry, glowMaterial);
                glow.rotation.x = -Math.PI / 2;
                glow.position.y = 0.02;
                baseStationGroup.add(glow);

                baseStationGroup.userData.glow = glow;
                baseStationGroup.userData.animationPhase = Math.random() * Math.PI * 2;
            } else {
                // 桌面使用較複雜的標記（保留原始實作）
                const baseGeometry = new THREE.CylinderGeometry(0.8, 1.0, 0.3, 8);
                const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, roughness: 0.6 });
                const base = new THREE.Mesh(baseGeometry, baseMaterial);
                base.position.y = 0.15;
                baseStationGroup.add(base);
                const towerGeometry = new THREE.CylinderGeometry(0.25, 0.4, 3.5, 8);
                const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.3, roughness: 0.5 });
                const tower = new THREE.Mesh(towerGeometry, towerMaterial);
                tower.position.y = 2.1;
                baseStationGroup.add(tower);
                const antennaGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
                const antennaMaterial = new THREE.MeshStandardMaterial({ color: color, emissive: glowColor, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.4 });
                const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
                antenna.position.y = 4.3;
                baseStationGroup.add(antenna);
                const panelGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.05);
                const panelMaterial = new THREE.MeshStandardMaterial({ color: color, emissive: glowColor, emissiveIntensity: 0.3, metalness: 0.1, roughness: 0.6 });
                for (let i = 0; i < 3; i++) {
                    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
                    const angle = (i * 120) * Math.PI / 180;
                    panel.position.x = Math.cos(angle) * 0.35;
                    panel.position.z = Math.sin(angle) * 0.35;
                    panel.position.y = 3.2;
                    panel.rotation.y = angle;
                    baseStationGroup.add(panel);
                }
                const glowGeometry = new THREE.SphereGeometry(0.5, 16, 16);
                const glowMaterial = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending });
                const glow = new THREE.Mesh(glowGeometry, glowMaterial);
                glow.position.y = 4.3;
                glow.scale.set(1.5, 1.5, 1.5);
                baseStationGroup.add(glow);
                baseStationGroup.userData.glow = glow;
                baseStationGroup.userData.animationPhase = Math.random() * Math.PI * 2;
            }

            // 設置基站群組位置
            baseStationGroup.position.set(worldPos.x, 0, worldPos.z);
            // 儲存基站資訊
            baseStationGroup.userData.station = station;
            // 添加到場景
            this.scene.add(baseStationGroup);
            this.baseStationMarkers.push(baseStationGroup);
        });
    }

    /**
     * 更新基站標記的可見性（根據距離）
     */
    updateBaseStationVisibility() {
        if (!this.baseStationMarkers || !this.currentLocation) return;

        const playerGPS = this.worldToGPS(this.camera.position);
        const maxDistanceDegrees = this.baseStationVisibleDistance * 0.009; // 公里轉度數

        this.baseStationMarkers.forEach(marker => {
            const station = marker.userData.station;
            
            // 計算玩家與基站的距離（度數）
            const latDiff = playerGPS.lat - station.lat;
            const lngDiff = playerGPS.lng - station.lng;
            const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
            
            // 根據距離控制可見性
            marker.visible = distance <= maxDistanceDegrees;
        });
    }

    /**
     * 將GPS座標轉換為3D世界座標
     */
    gpsToWorld(lat, lng) {
        // GPS座標轉換為3D世界座標
        // 與 worldToGPS 方法保持一致
        const kmToDegree = 0.009; // 1公里約等於0.009度
        const scaleToKm = 100; // 3D單位到公里的比例
        
        const deltaLat = lat - this.currentLocation.lat;
        const deltaLng = lng - this.currentLocation.lng;
        
        const deltaLatKm = deltaLat / kmToDegree;
        const deltaLngKm = deltaLng / kmToDegree;
        
        return {
            x: deltaLngKm * scaleToKm,  // X軸正方向為東
            z: -deltaLatKm * scaleToKm  // Z軸負方向為北
        };
    }

    /**
     * 更新最近基站資訊
     */
    updateNearestBaseStationInfo() {
        const playerGPS = this.worldToGPS(this.camera.position);
        
        // 計算玩家腳下的訊號強度
        const currentSignalStrength = signalGenerator.getSignalStrength(playerGPS.lat, playerGPS.lng);
        
        let nearestStation = null;
        let minDistance = Infinity;
        const allStationsInfo = [];

        // 找到最近的基站並收集所有基站資訊
        signalGenerator.baseStations.forEach((station, index) => {
            const distance = signalGenerator.calculateDistance(
                playerGPS.lat, playerGPS.lng,
                station.lat, station.lng
            );
            
            const distanceInMeters = Math.round(distance * 111000);
            allStationsInfo.push({
                index: index + 1,
                power: station.power,
                distance: distanceInMeters
            });
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestStation = { ...station, index, distance };
            }
        });

        // 按距離排序
        allStationsInfo.sort((a, b) => a.distance - b.distance);

        console.log('當前訊號強度:', currentSignalStrength + '%',
                    '最近基站:', nearestStation ? nearestStation.index + 1 : '無',
                    '距離:', Math.round(minDistance * 111000) + 'm');

        // 更新UI顯示 - 顯示當前位置的訊號強度
        if (this.modeElement) {
            const distanceInMeters = Math.round(minDistance * 111000);
            let infoHTML = `🖥️ Demo模式 | 📶 當前訊號: ${currentSignalStrength}%<br>`;
            infoHTML += `📡 最近基站: #${nearestStation ? nearestStation.index + 1 : '?'} | 📏 距離: ${distanceInMeters}m<br>`;
            infoHTML += `<div style="font-size: 10px; margin-top: 3px; opacity: 0.8;">`;
            infoHTML += `附近基站: `;
            allStationsInfo.slice(0, 3).forEach((station, idx) => {
                infoHTML += `#${station.index}(${station.distance}m)`;
                if (idx < 2 && idx < allStationsInfo.length - 1) infoHTML += ` | `;
            });
            infoHTML += `</div>`;
            this.modeElement.innerHTML = infoHTML;
        }
    }

    /**
     * 創建地面平面
     */
    createGroundPlane() {
        const groundGeometry = new THREE.PlaneGeometry(15, 15);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.3,
            metalness: 0.0,
            roughness: 1.0
        });

        // 若已存在，先移除舊的
        if (this.groundPlane) {
            try { this.scene.remove(this.groundPlane); } catch(e) { /* ignore */ }
            try { this.groundPlane.geometry.dispose(); } catch(e) { /* ignore */ }
            try { this.groundPlane.material.dispose(); } catch(e) { /* ignore */ }
            this.groundPlane = null;
        }

        this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2; // 水平放置
        // 使用 this.groundY（若存在）或預設 -0.5
        this.groundPlane.position.y = (typeof this.groundY !== 'undefined') ? this.groundY : -0.5;

        // 在 AR 模式下不要顯示地面，避免浮在相機畫面上的半透明平面
        this.groundPlane.visible = !this.isARActive;

        this.scene.add(this.groundPlane);
    }

    /**
     * 設定第一人稱控制
     */
    setupFirstPersonControls() {
        // 攝影機初始方向
        this.cameraDirection = new THREE.Vector3(0, 0, -1); // 向前看
        this.cameraRight = new THREE.Vector3(1, 0, 0); // 右側方向
        
        // 滑鼠控制變數
        this.isMouseLocked = false;
        this.mouseMovement = { x: 0, y: 0 };
        this.mouseSensitivity = 0.002;
        
        // 旋轉角度
        this.yaw = 0;   // 水平旋轉
        this.pitch = 0; // 垂直旋轉
        
        // 設定滑鼠事件
        this.setupMouseControls();
        
        console.log('第一人稱控制設定完成');
    }

    /**
     * 啟用裝置方向感測，用於 camera overlay 模式讓 three.js camera 跟著手機轉動
     */
    enableDeviceOrientation() {
        if (this.deviceOrientationEnabled) return;
        const setObjectQuaternion = (function () {
            const zee = new THREE.Vector3(0, 0, 1);
            const euler = new THREE.Euler();
            const q0 = new THREE.Quaternion();
            const q1 = new THREE.Quaternion(- Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X

            return function (quaternion, alpha, beta, gamma, orient) {
                const _x = beta ? beta * Math.PI / 180 : 0; // beta
                const _y = gamma ? gamma * Math.PI / 180 : 0; // gamma
                const _z = alpha ? alpha * Math.PI / 180 : 0; // alpha

                const cX = Math.cos(_x / 2);
                const cY = Math.cos(_y / 2);
                const cZ = Math.cos(_z / 2);
                const sX = Math.sin(_x / 2);
                const sY = Math.sin(_y / 2);
                const sZ = Math.sin(_z / 2);

                // ZXY quaternion
                const qw = cX * cY * cZ - sX * sY * sZ;
                const qx = sX * cY * cZ - cX * sY * sZ;
                const qy = cX * sY * cZ + sX * cY * sZ;
                const qz = cX * cY * sZ + sX * sY * cZ;

                quaternion.set(qx, qy, qz, qw);

                // adjust for screen orientation
                const orientRad = orient ? orient * Math.PI / 180 : 0;
                q1.setFromAxisAngle(zee, -orientRad);

                quaternion.multiply(q1);
                // apply rotation to align device coords with three.js world
                quaternion.multiply(q0);
            };
        })();

        this._deviceOrientationHandler = (event) => {
            if (!event) return;
            // 保存最新 orientation 給 debug overlay 使用
            try { this._captureDeviceOrientationForDebug(event); } catch (e) {}
            const alpha = event.alpha;
            const beta = event.beta;
            const gamma = event.gamma;
            const orient = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
            try {
                setObjectQuaternion(this.camera.quaternion, alpha, beta, gamma, orient);
            } catch (e) { /* ignore */ }
        };

        window.addEventListener('deviceorientation', this._deviceOrientationHandler, true);
        this.deviceOrientationEnabled = true;
        console.log('DeviceOrientation 控制啟用');
    }

    disableDeviceOrientation() {
        if (!this.deviceOrientationEnabled) return;
        try { window.removeEventListener('deviceorientation', this._deviceOrientationHandler, true); } catch (e) {}
        this._deviceOrientationHandler = null;
        this.deviceOrientationEnabled = false;
        console.log('DeviceOrientation 控制停用');
    }

    /**
     * 設定滑鼠控制
     */
    setupMouseControls() {
        const canvas = this.renderer.domElement;
        
        // 點擊畫布來鎖定滑鼠
        canvas.addEventListener('click', () => {
            if (!this.isMouseLocked) {
                canvas.requestPointerLock();
            }
        });

        // 監聽指標鎖定狀態變化
        document.addEventListener('pointerlockchange', () => {
            this.isMouseLocked = document.pointerLockElement === canvas;
            console.log('滑鼠鎖定:', this.isMouseLocked);
        });

        // 監聽滑鼠移動
        document.addEventListener('mousemove', (event) => {
            if (!this.isMouseLocked) return;

            this.yaw -= event.movementX * this.mouseSensitivity;
            this.pitch -= event.movementY * this.mouseSensitivity;

            // 限制垂直視角
            this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

            // 更新攝影機方向
            this.updateCameraDirection();
        });

        // ESC 鍵解鎖滑鼠
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Escape' && this.isMouseLocked) {
                document.exitPointerLock();
            }
        });
    }

    /**
     * 更新攝影機方向
     */
    updateCameraDirection() {
        // 計算新的攝影機方向（Three.js中Z軸負方向為前）
        const direction = new THREE.Vector3();
        direction.x = -Math.sin(this.yaw) * Math.cos(this.pitch);
        direction.y = Math.sin(this.pitch);
        direction.z = -Math.cos(this.yaw) * Math.cos(this.pitch);
        
        this.cameraDirection.copy(direction).normalize();
        
        // 更新右側方向向量
        this.cameraRight.crossVectors(this.cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
        
        // 設定攝影機朝向
        const target = new THREE.Vector3().copy(this.camera.position).add(this.cameraDirection);
        this.camera.lookAt(target);
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        // AR 切換按鈕
        // 行動裝置（手機）: 若支援 AR，將按鈕作為一次性的「開始 AR」按鈕，點擊直接進入 AR 並隱藏按鈕
        // 桌面: 保留原本的切換行為
        try {
            const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 480;
            if (this.toggleARButton) {
                if (isMobile) {
                    // Mobile: single-start behaviour
                    this.toggleARButton.addEventListener('click', async () => {
                        if (this.isARSupported) {
                            try {
                                await this.startAR();
                            } catch (e) {
                                console.error('啟動 AR 失敗:', e);
                            }
                            // 隱藏或停用按鈡，避免再次切換
                            try { this.toggleARButton.style.display = 'none'; } catch(e) { /* ignore */ }
                            try { this.toggleARButton.disabled = true; } catch(e) { /* ignore */ }
                        } else {
                            alert('您的裝置不支援 AR（位置追蹤模式）。請改用支援位置型 AR 的瀏覽器或裝置。');
                        }
                    });
                } else {
                    // Desktop: change to start-only behavior (remove stop control)
                    this.toggleARButton.addEventListener('click', async () => {
                        if (this.isARSupported) {
                            try {
                                await this.startAR();
                            } catch (e) {
                                console.error('啟動 AR 失敗:', e);
                            }
                            try { this.toggleARButton.style.display = 'none'; } catch(e) {}
                            try { this.toggleARButton.disabled = true; } catch(e) {}
                        } else {
                            alert('您的設備不支援 AR（位置追蹤模式）。請改用支援位置型 AR 的瀏覽器或裝置。');
                        }
                    });
                }
            }
        } catch (e) { console.warn('設定 AR 按鈕時發生錯誤', e); }

        // 重置視角按鈕
        this.resetViewButton.addEventListener('click', () => {
            this.resetView();
        });

        // 切換網格按鈕（設置初始文字和圖示）
        this.toggleGridButton.textContent = '🙈 隱藏網格'; // 預設顯示網格，所以按鈕顯示「隱藏」
        this.toggleGridButton.addEventListener('click', () => {
            this.toggleGrid();
        });

        // 窗口大小變化
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    /**
     * 設定鍵盤控制
     */
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'KeyW': this.keys.w = true; break;
                case 'KeyA': this.keys.a = true; break;
                case 'KeyS': this.keys.s = true; break;
                case 'KeyD': this.keys.d = true; break;
                case 'ShiftLeft': this.keys.shift = true; break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW': this.keys.w = false; break;
                case 'KeyA': this.keys.a = false; break;
                case 'KeyS': this.keys.s = false; break;
                case 'KeyD': this.keys.d = false; break;
                case 'ShiftLeft': this.keys.shift = false; break;
            }
        });
    }

    /**
     * 處理鍵盤移動
     */
    handleKeyboardMovement() {
        if (this.isARActive) return; // AR 模式中不使用鍵盤控制

        const speed = this.keys.shift ? 0.3 : 0.15; // 調整為合理的移動速度
        let moved = false;
        
        // 使用第一人稱的方向向量
        const forward = new THREE.Vector3().copy(this.cameraDirection);
        forward.y = 0; // 限制在水平面移動
        forward.normalize();
        
        const right = new THREE.Vector3().copy(this.cameraRight);

        const oldPosition = this.camera.position.clone();

        if (this.keys.w) {
            this.camera.position.addScaledVector(forward, speed);
            moved = true;
        }
        if (this.keys.s) {
            this.camera.position.addScaledVector(forward, -speed);
            moved = true;
        }
        if (this.keys.a) {
            this.camera.position.addScaledVector(right, -speed);
            moved = true;
        }
        if (this.keys.d) {
            this.camera.position.addScaledVector(right, speed);
            moved = true;
        }

        // 保持攝影機在固定的人眼高度 (1.7公尺)
        this.camera.position.y = 1.7;

        // 移動時更新可見網格範圍（從預先生成的數據中篩選）
        if (moved) {
            const distance = oldPosition.distanceTo(this.camera.position);
            this.accumulatedDistance += distance;
            
            // 每累積移動一定距離後更新可見範圍
            if (this.accumulatedDistance >= 3.0) { // 每移動3米更新一次可見範圍
                this.updateLocationDisplay();
                this.updateVisibleGrid(); // 只更新可見範圍，不重新生成數據
                this.accumulatedDistance = 0; // 重置累積距離
            }
        }
    }

    /**
     * 更新位置顯示
     */
    updateLocationDisplay() {
        const playerGPS = this.worldToGPS(this.camera.position);
        if (this.locationElement) {
            this.locationElement.textContent = 
                `📍 位置: ${playerGPS.lat.toFixed(5)}, ${playerGPS.lng.toFixed(5)}`;
        }
        
        // 更新最近基站資訊
        this.updateNearestBaseStationInfo();
    }

    /**
     * 重置視角
     */
    resetView() {
        if (!this.isARActive) {
            // 重置位置和視角
            this.camera.position.set(0, 1.7, 0);
            
            // 重置第一人稱視角
            this.yaw = 0;
            this.pitch = 0;
            this.updateCameraDirection();
            // 重置後更新訊號網格
            this.updateSignalGrid();
            this.updateLocationDisplay();
        }
    }

    /**
     * 切換 AR 模式
     */
    async toggleAR() {
        if (!this.isARSupported) {
            alert('您的設備不支援 AR（位置追蹤模式）\n\n需要:\n- 支援相機與定位的瀏覽器（Chrome/Safari）\n- HTTPS連線\n- 已授權相機與定位權限');
            return;
        }

        if (this.isARActive) {
            // 停止 AR
            this.stopAR();
        } else {
            // 啟動 AR
            await this.startAR();
        }
    }

    /**
     * 啟動 AR 模式
     */
    async startAR() {
        // 我們改用 A-Frame + AR.js 的 location-based AR
        try {
            console.log('啟動 Location-based AR（A-Frame）...');
            this.updateStatus('啟動 Location AR...');

            // 顯示 A-Frame 場景
            const aframeScene = document.getElementById('aframeScene');
            if (!aframeScene) throw new Error('找不到 A-Frame 場景 (aframeScene)');
            // 在顯示之前，確認 AR.js / A-Frame 的 gps-entity-place 已註冊
            const waitForARjs = (timeout = 3000) => new Promise((resolve) => {
                const start = Date.now();
                (function check(){
                    const pluginReady = !!(window.ARjs || (window.AFRAME && AFRAME.components && AFRAME.components['gps-entity-place']));
                    if (pluginReady) return resolve(true);
                    if (Date.now() - start >= timeout) return resolve(false);
                    setTimeout(check, 100);
                })();
            });

            const arjsReady = await waitForARjs(3000);
            if (!arjsReady) {
                console.warn('aframe-ar.js 尚未就緒或未載入，改用相機 fallback (startLocationAR)');
                // fallback to camera-based AR which uses the <video> element
                await this.startLocationAR();
                return;
            }

            aframeScene.style.display = 'block';

            // 將 Three.js renderer 隱藏或放至背景以避免遮蓋（保持桌面模擬功能可用）
            try { if (this.renderer && this.renderer.domElement) this.renderer.domElement.style.display = 'none'; } catch(e) {}

            // 設定狀態
            this.isARActive = true;
            this.updateMode('📍 Location AR 模式');
            this.updateStatus('Location AR 已啟動');

            // 生成並同步目前的訊號網格到 A-Frame
            this.createAFrameGrid();

            // 確保 GPS 追蹤正在運行
            if (!this.gpsWatchId) this.startGPSTracking();

            this.ensureUIVisibilityInAR();
            document.body.classList.add('in-ar');

            console.log('✅ Location-based AR 啟動完成');
        } catch (err) {
            console.error('Location AR 啟動失敗:', err);
            this.updateStatus('Location AR 啟動失敗: ' + (err && err.message ? err.message : err));
            alert('啟動 Location AR 失敗：' + (err && err.message ? err.message : err));
        }
    }

    /**
     * 啟動 location-based AR（相機影片 + GPS 覆蓋），作為 WebXR 的 fallback（支援 iOS Safari）
     */
    async startLocationAR() {
        if (this.isARActive) return;
        console.log('啟動 Location-based AR fallback...');
        this.updateStatus('啟動相機並啟用 AR 視覺化 (相機模式)');

        // 取得 video element
        const video = document.getElementById('arVideo');
        if (!video) throw new Error('找不到 video 元素');

        // 要求相機權限並啟動前置或後置相機（偏好後置）
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 480;
        const constraints = {
            audio: false,
            video: {
                facingMode: { ideal: 'environment' },
                // 手機使用較低解析度以減少記憶體壓力
                width: (isMobile ? { ideal: 1280 } : { ideal: 1920 }),
                height: (isMobile ? { ideal: 720 } : { ideal: 1080 })
            }
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            video.play().catch(e => console.warn('video play error', e));
            video.style.display = 'block';

            // 調整 UI 層級
            try { document.body.classList.add('in-ar'); } catch(e) {}

            // 隱藏地面並切換狀態
            try { if (this.groundPlane) this.groundPlane.visible = false; } catch(e) {}
            this.isARActive = true;
            this.updateMode('📍 Camera AR 模式');
            this.updateStatus('Camera AR 已啟動');

            // 使用已有的 GPS 追蹤：確保 gpsWatch 正在更新 currentLocation
            if (!this.gpsWatchId) this.startGPSTracking();

            // 設定 grid 錨點為目前位置，之後網格會以此為世界原點
            try { this.gridCenter = { lat: this.currentLocation.lat, lng: this.currentLocation.lng }; } catch(e) {}

            // 嘗試在 iOS 上請求 DeviceOrientation 權限（如果 API 存在）
            try {
                if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    DeviceOrientationEvent.requestPermission().then((perm) => {
                        if (perm === 'granted') {
                            console.log('DeviceOrientation permission granted');
                            this._lastHeadingSource = 'device';
                            // 啟用 handler（enableDeviceOrientation 會加上 listener）
                            try { this.enableDeviceOrientation(); } catch (e) { console.warn('enableDeviceOrientation fail', e); }
                        } else {
                            console.warn('DeviceOrientation permission denied');
                            this._lastHeadingSource = 'gps';
                        }
                    }).catch(err => {
                        console.warn('DeviceOrientation permission request error', err);
                        this._lastHeadingSource = 'gps';
                    });
                }
            } catch (e) { /* ignore */ }

            // 當 GPS 更新時，startGPSTracking 的 callback 會更新 camera.position 與呼叫 updateVisibleGrid
            // 這裡手動執行一次以確保第一次渲染生效
            this.updateVisibleGrid();

            // 將 renderer canvas 與 scene 背景調整為透明（相機在底層）
            try {
                this.scene.background = null;
                if (this.renderer && this.renderer.domElement) {
                    this.renderer.domElement.style.zIndex = '1';
                    this.renderer.domElement.style.pointerEvents = 'none';
                }
            } catch (e) { /* ignore */ }

            // 確保 UI 在前景可見
            this.ensureUIVisibilityInAR();

        } catch (err) {
            console.error('啟動相機失敗:', err);
            this.updateStatus('啟動相機失敗: ' + (err && err.message ? err.message : err));
            throw err;
        }
    }

    /**
     * 停止 location-based AR
     */
    stopLocationAR() {
        console.log('停止 Location-based AR');
        const video = document.getElementById('arVideo');
        if (video && video.srcObject) {
            try {
                const tracks = video.srcObject.getTracks();
                tracks.forEach(t => { try { t.stop(); } catch(e) {} });
            } catch (e) { /* ignore */ }
            try { video.srcObject = null; } catch(e) {}
            try { video.pause(); } catch(e) {}
            video.style.display = 'none';
        }

        // 恢復地面可見
        try { if (this.groundPlane) this.groundPlane.visible = true; } catch(e) {}

        this.isARActive = false;
        this.updateMode('桌面模式');
        this.updateStatus('Camera AR 已停止');
        this.restoreUIDefaultZIndex();

        // 留下 GPS 追蹤（不自動停止），如需停止可在外部呼叫 navigator.geolocation.clearWatch
    }

    /**
     * 在 A-Frame 場景中創建基於 GPS 的訊號網格
     */
    createAFrameGrid() {
        try {
            const aGridRoot = document.getElementById('aGridRoot');
            if (!aGridRoot) return;

            // 清除既有
            while (aGridRoot.firstChild) aGridRoot.removeChild(aGridRoot.firstChild);

            // 使用目前 signalGrid（若尚未生成，先呼叫 updateVisibleGrid）
            if (!this.signalGrid || this.signalGrid.length === 0) this.updateVisibleGrid();

            this.signalGrid.forEach(cell => {
                const el = document.createElement('a-entity');
                // gps-entity-place 會使用 data-gps-attributes
                el.setAttribute('gps-entity-place', `latitude: ${cell.lat}; longitude: ${cell.lng};`);

                // 視覺化：使用平面或 box
                const color = '#' + (cell.color >>> 0).toString(16).padStart(6, '0');
                el.setAttribute('geometry', `primitive: box; height: 0.1; width: 1.8; depth: 1.8`);
                el.setAttribute('material', `color: ${color}; opacity: 0.85; transparent: true`);
                // 微微抬高以免被地表吃掉
                const aframeY = (typeof this.groundY !== 'undefined' ? this.groundY : -0.5) + 0.05;
                el.setAttribute('position', `0 ${aframeY} 0`);

                aGridRoot.appendChild(el);
            });

            console.log('已在 A-Frame 場景中創建訊號網格:', this.signalGrid.length);
        } catch (e) {
            console.warn('createAFrameGrid 錯誤:', e);
        }
    }

    /**
     * 清除 A-Frame 場景中的訊號網格
     */
    clearAFrameGrid() {
        try {
            const aGridRoot = document.getElementById('aGridRoot');
            if (!aGridRoot) return;
            while (aGridRoot.firstChild) aGridRoot.removeChild(aGridRoot.firstChild);
            console.log('已清除 A-Frame 訊號網格');
        } catch (e) {
            console.warn('clearAFrameGrid 錯誤:', e);
        }
    }

    /**
     * 停止 AR 模式
     */
    stopAR() {
        // 停止 A-Frame location AR（若有），並恢復桌面視圖
        try {
            const aframeScene = document.getElementById('aframeScene');
            if (aframeScene) aframeScene.style.display = 'none';
        } catch (e) { /* ignore */ }

        // 顯示 three.js renderer
        try { if (this.renderer && this.renderer.domElement) this.renderer.domElement.style.display = ''; } catch(e) {}

        // 清理 A-Frame 內的 grid
        try { this.clearAFrameGrid(); } catch(e) {}

        this.isARActive = false;
        this.updateMode('桌面模式');
        this.updateStatus('AR 已停止');
        document.body.classList.remove('in-ar');
        this.restoreUIDefaultZIndex();

        // 恢復地面可見
        try { if (this.groundPlane) this.groundPlane.visible = true; } catch(e) {}

        // 重新生成 three.js 網格
        try { this.updateGridMesh(); } catch(e) {}
    }

    /**
     * 確保UI在AR模式下可見
     */
    ensureUIVisibilityInAR() {
        // 提高UI元素的z-index以確保在AR模式下可見
        const uiElements = [
            this.statusElement,
            this.locationElement,
            this.modeElement,
            this.toggleARButton,
            this.resetViewButton,
            this.toggleGridButton
        ];

        uiElements.forEach(element => {
            if (element) {
                element.style.zIndex = '9999';
                // 確保元素可見
                element.style.display = 'block';
                element.style.visibility = 'visible';
            }
        });

        // 同時提高父容器元素的z-index
        const containers = document.querySelectorAll('#info, #controls, #legend');
        containers.forEach(container => {
            container.style.zIndex = '9999';
        });

        console.log('UI 可見性已調整以適應AR模式');
    }

    /**
     * 恢復UI的預設z-index
     */
    restoreUIDefaultZIndex() {
        // 恢復UI元素的預設z-index
        const uiElements = [
            this.statusElement,
            this.locationElement,
            this.modeElement,
            this.toggleARButton,
            this.resetViewButton,
            this.toggleGridButton
        ];

        uiElements.forEach(element => {
            if (element) {
                element.style.zIndex = '100';
            }
        });

        // 恢復父容器元素的預設z-index
        const containers = document.querySelectorAll('#info, #controls, #legend');
        containers.forEach(container => {
            container.style.zIndex = '100';
        });

        console.log('UI z-index 已恢復到桌面模式預設值');
    }

    /**
     * 切換網格顯示
        this.gridVisible = !this.gridVisible;
        if (this.gridMesh) {
            this.gridMesh.visible = this.gridVisible;
        }
        // 根據狀態更新按鈕文字和圖示
        this.toggleGridButton.textContent = this.gridVisible ? '🙈 隱藏網格' : '👁️ 顯示網格';
    }

    /**
     * 動畫循環（支援AR和桌面模式）
     */
    animate() {
        let frameCount = 0;
        const debugElement = document.getElementById('debug');
        
    // 使用兼容的動畫循環：若 A-Frame/renderer.xr 介入，避免直接呼叫 setAnimationLoop 造成衝突
    const renderLoop = (time) => {
            // FPS 計算（簡單平滑）
            if (!this._lastFrameTime) this._lastFrameTime = time;
            const dt = time - this._lastFrameTime;
            this._lastFrameTime = time;
            const fpsNow = dt > 0 ? (1000 / dt) : 0;
            if (!this._fps) this._fps = Math.round(fpsNow);
            else this._fps = Math.round((this._fps * 0.9) + (fpsNow * 0.1));
            // 只在桌面模式下處理鍵盤移動
            if (!this.isARActive) {
                this.handleKeyboardMovement();
            }

            // 若 deviceorientation 不可用且有 GPS heading，套用 GPS-based heading 作為相機 yaw（僅在 camera overlay 模式）
            try {
                this.applyHeadingFallback && this.applyHeadingFallback();
            } catch (e) { /* ignore */ }

            // 更新基站光暈脈動動畫
            this.animateBaseStations(time);

            // 每30幀（約0.5秒）更新一次UI和基站可見性
            frameCount++;
            if (frameCount % 30 === 0) {
                this.updateNearestBaseStationInfo();
                this.updateBaseStationVisibility(); // 更新基站圖示可見性
                
                // 更新調試資訊
                if (debugElement) {
                    const playerGPS = this.worldToGPS(this.camera.position);
                    const mode = this.isARActive ? 'AR' : '桌面';
                    debugElement.textContent = `${mode} | GPS: ${playerGPS.lat.toFixed(5)}, ${playerGPS.lng.toFixed(5)}`;
                }
                
                frameCount = 0;
            }

            // 每幀確保網格不被剔除且可見（某些裝置/driver 在特定角度會造成短暫消失）
            try {
                if (this.gridMesh) {
                    this.gridMesh.frustumCulled = false;
                    this.gridMesh.visible = this.gridVisible;
                    this.gridMesh.renderOrder = 10;
                    if (this.gridMesh.material) this.gridMesh.material.depthTest = false;
                }
            } catch (e) { /* ignore */ }

            this.renderer.render(this.scene, this.camera);
            // 如果 A-Frame 已經管理 render loop，避免自行呼叫 requestAnimationFrame 造成雙重渲染
            if (!window.AFRAME || !AFRAME.scenes || AFRAME.scenes.length === 0) {
                requestAnimationFrame(renderLoop);
            }
        };

        try {
            if (this.renderer && typeof this.renderer.setAnimationLoop === 'function') {
                // 在大多數 three.js 環境中可直接使用，但若 A-Frame 已介入，使用 requestAnimationFrame
                if (window.AFRAME && AFRAME.scenes && AFRAME.scenes.length > 0) {
                    // A-Frame 已經存在，使用 requestAnimationFrame 以避免與 A-Frame 的 renderer 衝突
                    requestAnimationFrame(renderLoop);
                } else {
                    this.renderer.setAnimationLoop(renderLoop);
                }
            } else {
                requestAnimationFrame(renderLoop);
            }
        } catch (e) {
            // 任何錯誤回退到 requestAnimationFrame
            requestAnimationFrame(renderLoop);
        }
    }

    /**
     * 初始化並顯示簡易的 debug overlay
     */
    initDebugOverlay() {
        if (this._debugOverlayInitialized) return;
        this._debugOverlayInitialized = true;

        const el = document.createElement('div');
        el.id = 'debugOverlay';
        el.style.position = 'fixed';
        el.style.left = '8px';
        el.style.top = '8px';
        el.style.padding = '6px 8px';
        el.style.background = 'rgba(0,0,0,0.6)';
        el.style.color = '#0ff';
        el.style.fontFamily = 'monospace';
        el.style.fontSize = '12px';
        el.style.zIndex = '10000';
        el.style.pointerEvents = 'none';
        el.style.maxWidth = '320px';
        el.style.whiteSpace = 'pre-wrap';
        el.textContent = 'debug overlay initializing...';
        document.body.appendChild(el);
        this._debugElement = el;

        // 更新頻率 250ms
        this._debugInterval = setInterval(() => this.updateDebugOverlay(), 250);
    }

    updateDebugOverlay() {
        if (!this._debugElement) return;
        const playerGPS = (this.currentLocation) ? `${this.currentLocation.lat.toFixed(6)}, ${this.currentLocation.lng.toFixed(6)}` : 'n/a';
        const gridCenter = (this.gridCenter) ? `${this.gridCenter.lat.toFixed(6)}, ${this.gridCenter.lng.toFixed(6)}` : 'n/a';
        const instanceCount = (this.instancedGrid && typeof this.instancedGrid.count !== 'undefined') ? this.instancedGrid.count : (this.signalGrid ? this.signalGrid.length : 0);
        const camPos = this.camera ? `x:${this.camera.position.x.toFixed(2)} y:${this.camera.position.y.toFixed(2)} z:${this.camera.position.z.toFixed(2)}` : 'n/a';
        const camQuat = this.camera ? `x:${this.camera.quaternion.x.toFixed(3)} y:${this.camera.quaternion.y.toFixed(3)} z:${this.camera.quaternion.z.toFixed(3)} w:${this.camera.quaternion.w.toFixed(3)}` : 'n/a';
        const orientation = (window.DeviceOrientationEvent && this._lastDeviceOrientation) ? `α:${(this._lastDeviceOrientation.alpha||0).toFixed(1)} β:${(this._lastDeviceOrientation.beta||0).toFixed(1)} γ:${(this._lastDeviceOrientation.gamma||0).toFixed(1)}` : 'n/a';
        const fps = this._fps || 'n/a';
        // heading 優先使用 device orientation（若存在），否則使用 GPS-based 計算
        let headingVal = 'n/a';
        let headingSource = this._lastHeadingSource || 'n/a';
        if (this._lastDeviceOrientation && typeof this._lastDeviceOrientation.alpha === 'number') {
            // device alpha 相對於磁北或真北依裝置而異；使用 alpha 為簡單指向參考
            headingVal = (this._lastDeviceOrientation.alpha || 0).toFixed(1) + '°';
            headingSource = 'device';
        } else if (typeof this._gpsHeading === 'number') {
            headingVal = this._gpsHeading.toFixed(1) + '°';
            headingSource = 'gps';
        }

        const lines = [];
        lines.push(`GPS: ${playerGPS}`);
        lines.push(`gridCenter: ${gridCenter}`);
        lines.push(`instances: ${instanceCount}`);
        lines.push(`camPos: ${camPos}`);
        lines.push(`camQuat: ${camQuat}`);
    lines.push(`deviceOri: ${orientation}`);
    lines.push(`heading: ${headingVal} (${headingSource})`);
        lines.push(`fps: ${fps}`);

        this._debugElement.textContent = lines.join('\n');
    }

    // Override device orientation handler to capture last values for debug overlay
    _captureDeviceOrientationForDebug(event) {
        this._lastDeviceOrientation = event;
    }

    /**
     * 當 deviceorientation 不可用時，用 GPS heading 作為相機的 yaw fallback
     */
    applyHeadingFallback() {
        // 只在 camera overlay 模式（isARActive 且 A-Frame 未顯示）使用
        const aframeScene = document.getElementById('aframeScene');
        const aframeVisible = aframeScene && aframeScene.style.display !== 'none';
        if (!this.isARActive || aframeVisible) return;

        // 若裝置 orientation 有值，則不使用 GPS fallback
        if (this._lastDeviceOrientation && typeof this._lastDeviceOrientation.alpha === 'number') return;

        if (typeof this._gpsHeading !== 'number') return; // 無 GPS heading

        // 將 bearing (度，0..360，北為0，順時針) 轉換為 three.js 的 yaw（radians），
        // 我們假設 camera 的 yaw 為 0 時面向 -Z（three.js 的 forward），
        // 所以需將 bearing (北為0) 轉為 camera yaw：
        // bearing 0 (北) -> camera yaw = 0 (若 world 前方設為北則不需轉)
        // 但目前 worldToGPS 與 gpsToWorld 假設 Z 負為北，因此需要把 bearing 轉為 yaw

        // 轉換策略：bearing (deg) -> worldAngleRad = (bearing - 180) * deg2rad
        // 經測試常見對應為減去 180 度，使得 bearing=0(北) 使 camera 面向北方向的 -Z
        const deg2rad = Math.PI / 180;
        const worldAngleRad = (this._gpsHeading - 180) * deg2rad;

        // 更新 yaw 並套用到 camera quaternion（平滑過渡）
        // 直接設置 this.yaw
        this.yaw = worldAngleRad;
        // 限制 pitch 保持原狀
        this.updateCameraDirection();
    }

    /**
     * 基站光暈脈動動畫
     */
    animateBaseStations(time) {
        if (!this.baseStationMarkers) return;

        this.baseStationMarkers.forEach(marker => {
            const glow = marker.userData.glow;
            const phase = marker.userData.animationPhase;
            
            if (glow) {
                // 脈動效果（0.8 ~ 1.2 之間變化）
                const scale = 1.0 + Math.sin(time * 0.002 + phase) * 0.2;
                glow.scale.set(scale * 1.5, scale * 1.5, scale * 1.5);
                
                // 透明度脈動（0.1 ~ 0.25 之間變化）
                glow.material.opacity = 0.15 + Math.sin(time * 0.003 + phase) * 0.1;
            }
        });
    }

    /**
     * 更新狀態顯示
     */
    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
        console.log('狀態:', message);
    }

    /**
     * 更新位置顯示
     */
    updateLocation() {
        if (this.locationElement && this.currentLocation) {
            this.locationElement.textContent = 
                `位置: ${this.currentLocation.name} (${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)})`;
        }
    }

    /**
     * 更新模式顯示
     */
    updateMode(mode) {
        if (this.modeElement) {
            this.modeElement.textContent = `模式: ${mode}`;
        }
    }

    /**
     * 隱藏載入畫面
     */
    hideLoading() {
        if (this.loadingElement) {
            this.loadingElement.style.display = 'none';
        }
    }
}

// 應用程式啟動
window.addEventListener('DOMContentLoaded', () => {
    // 等待 THREE 或 AFRAME.THREE 可用，並確保 A-Frame 的 registerComponent 已就緒再建立應用程式
    const startAppNow = () => {
        try {
            const app = new ARSignalApp();
            window.arApp = app; // 全域參考，便於除錯
            console.log('ARSignalApp 已建立');
        } catch (e) {
            console.error('建立 ARSignalApp 失敗，將重試一次:', e);
            setTimeout(() => {
                try { window.arApp = new ARSignalApp(); } catch (err) { console.error('重試失敗:', err); }
            }, 500);
        }
    };

    // 等待 THREE 或 AFRAME.registerComponent（柔性回退，避免拋例外導致堆疊訊息混亂）
    const waitForThreeAndAframe = async (timeoutMs = 8000) => {
        const start = Date.now();
        return new Promise((resolve) => {
            (function check(){
                const threeAvailable = (typeof THREE !== 'undefined') || (window.AFRAME && AFRAME.THREE);
                const registerOk = (window.AFRAME && typeof AFRAME.registerComponent === 'function');
                if (threeAvailable && registerOk) return resolve({ three: true, register: true });
                if (threeAvailable && !registerOk) return resolve({ three: true, register: false });
                if (Date.now() - start > timeoutMs) return resolve({ three: false, register: false });
                setTimeout(check, 100);
            })();
        });
    };

    (async () => {
        const status = await waitForThreeAndAframe(8000);
        if (status.three) {
            try { if (typeof THREE === 'undefined' && window.AFRAME && AFRAME.THREE) window.THREE = AFRAME.THREE; } catch(e) {}
            if (!status.register) {
                console.warn('AFRAME.registerComponent 尚未就緒，但 THREE 可用，將在受限模式下啟動（A-Frame plugin 功能可能缺失）');
            }
            startAppNow();
        } else {
            // 無法取得 THREE：顯示友善錯誤並嘗試最後一次啟動（啟動會在內部顯示錯誤）
            console.error('無法在限定時間內取得 THREE（可能是 A-Frame 或 three.js 未載入）。請檢查 script 載入順序或網路連線。');
            try {
                startAppNow();
            } catch (e) {
                console.error('最終啟動失敗，AR 應用無法啟動:', e);
                try { this.updateStatus && this.updateStatus('無法啟動：缺少 THREE.js。請檢查資源載入。'); } catch (x) {}
            }
        }
    })();
});
