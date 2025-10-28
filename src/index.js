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
    // On every GPS update, create a small grid of boxes centered at the user's
    // current longitude/latitude and remove boxes that moved out of range.

    // Debug the very first location once
    if(firstLocation) {
        alert(`Got the initial location: longitude ${ev.position.coords.longitude}, latitude ${ev.position.coords.latitude}`);
        firstLocation = false;
    }

    // Grid configuration (degrees). cellSize ~ 0.00001 ≈ ~1.1m (latitude)
    const cellSize = 0.00001;
    // radius in cells (1 => 3x3 grid). Increase for larger area.
    const gridRadius = 1;

    // Keep maps of active grid cells -> mesh
    if(typeof window.__locarGrid === 'undefined') {
        window.__locarGrid = new Map();
        // shared geometry to reduce allocations (enlarged for visibility)
        window.__locarGridGeom = new THREE.BoxGeometry(40,40,40);
        // add a light so MeshLambertMaterial is visible
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(0, 1, 1);
        scene.add(dirLight);
        const amb = new THREE.AmbientLight(0x404040);
        scene.add(amb);
    }

    const grid = window.__locarGrid;
    const geom = window.__locarGridGeom;

    const centerLon = ev.position.coords.longitude;
    const centerLat = ev.position.coords.latitude;

    // Helper to build a key for a cell using fixed precision to avoid tiny float diffs
    const makeKey = (lon, lat) => `${lon.toFixed(6)}_${lat.toFixed(6)}`;

    // Add required cells
    for(let dx = -gridRadius; dx <= gridRadius; dx++){
        for(let dy = -gridRadius; dy <= gridRadius; dy++){
            const lon = +(centerLon + dx * cellSize).toFixed(6);
            const lat = +(centerLat + dy * cellSize).toFixed(6);
            const key = makeKey(lon, lat);
            if(!grid.has(key)){
                // color based on offset (convert to HSL for variety)
                const h = ((dx + gridRadius) * (2*gridRadius+1) + (dy + gridRadius)) / Math.pow((2*gridRadius+1),2);
                const color = new THREE.Color().setHSL(h, 0.6, 0.5);

                const mesh = new THREE.Mesh(
                    geom,
                    new THREE.MeshLambertMaterial({ color })
                );

                // Add the mesh at the geo coordinate using locar so it is positioned correctly
                try {
                    locar.add(mesh, lon, lat);
                } catch(e) {
                    // In case locar.add throws, still add to scene as a fallback
                    scene.add(mesh);
                }

                grid.set(key, { mesh, lon, lat });
            }
        }
    }

    // Remove cells that are now outside the radius
    for(const [key, entry] of Array.from(grid.entries())){
        const lonDiff = Math.abs(entry.lon - centerLon) / cellSize;
        const latDiff = Math.abs(entry.lat - centerLat) / cellSize;
        if(lonDiff > gridRadius || latDiff > gridRadius){
            // remove visually
            if(entry.mesh.parent) entry.mesh.parent.remove(entry.mesh);
            // dispose material to avoid leaks
            if(entry.mesh.material){
                if(Array.isArray(entry.mesh.material)){
                    entry.mesh.material.forEach(m => m.dispose && m.dispose());
                } else {
                    entry.mesh.material.dispose && entry.mesh.material.dispose();
                }
            }
            grid.delete(key);
        }
    }
    // Debug logging and status update
    try{
        console.log('gpsupdate center', centerLon, centerLat, 'cells', grid.size);
        const statusEl = document.getElementById('locarStatus');
        if(statusEl){
            statusEl.textContent = `Center: ${centerLon.toFixed(6)}, ${centerLat.toFixed(6)} | Cells: ${grid.size}`;
        }
        const gpsEl = document.getElementById('gpsStatus');
        if(gpsEl){
            gpsEl.textContent = `cellSize: ${cellSize}, gridRadius: ${gridRadius}`;
        }
    }catch(e){
        // ignore status updates if DOM not available
    }
});

locar.startGps();

// Helper: safe element getter to avoid null access from third-party code paths
function safeEl(id){
    try{
        return document.getElementById(id) || null;
    }catch(e){
        return null;
    }
}

const setFakeBtn = safeEl('setFakeLoc');
const fakeLonEl = safeEl('fakeLon');
const fakeLatEl = safeEl('fakeLat');

if(setFakeBtn){
    setFakeBtn.addEventListener("click", e => {
        alert("Using fake input GPS, not real GPS location");
        locar.stopGps();
        const lon = fakeLonEl ? parseFloat(fakeLonEl.value) : NaN;
        const lat = fakeLatEl ? parseFloat(fakeLatEl.value) : NaN;
        if(!isFinite(lon) || !isFinite(lat)){
            alert('Invalid fake coordinates');
            return;
        }
        locar.fakeGps(lon, lat);
    });
} else {
    // No fake button found; ensure possible third-party writes don't fail by
    // ensuring defensive status elements exist (added in HTML patch)
}

renderer.setAnimationLoop(animate);

function animate() {
    deviceOrientationControls?.update();
    renderer.render(scene, camera);
}
