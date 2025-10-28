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

// Grid configuration (deg). Approx: 0.00001° ≈ 1.11m latitude
const GRID_SPACING_DEG = 0.00001; // spacing between grid squares in degrees
const GRID_RADIUS_STEPS = 2; // how many steps out from user's position (2 => 5x5 grid)
const KEY_DECIMALS = 6; // decimals for map keys

// Store created grid meshes keyed by 'lon_lat'
const gridMap = new Map();
let lastGridCenter = null; // {lon, lat}

const boxGeom = new THREE.BoxGeometry(10,10,2);

function makeBoxMesh(colour=0x00ff00) {
    return new THREE.Mesh(
        boxGeom,
        new THREE.MeshBasicMaterial({color: colour})
    );
}

function keyFor(lon, lat) {
    return `${lon.toFixed(KEY_DECIMALS)}|${lat.toFixed(KEY_DECIMALS)}`;
}

function updateStatus() {
    const status = document.getElementById('locarStatus');
    const gpsStatus = document.getElementById('gpsStatus');
    status.innerText = `Grid squares: ${gridMap.size}`;
    if(lastGridCenter) {
        gpsStatus.innerText = `Center: ${lastGridCenter.lon.toFixed(6)}, ${lastGridCenter.lat.toFixed(6)}`;
    }
}

function removeGridKey(key) {
    const entry = gridMap.get(key);
    if(!entry) return;
    try {
        // remove from scene
        scene.remove(entry.mesh);
        // if locar attached any references, try to remove by calling locar.remove if available
        if(typeof locar.remove === 'function') {
            try { locar.remove(entry.mesh); } catch(e) {}
        }
        // dispose geometry/material if not shared
        if(entry.mesh.geometry) entry.mesh.geometry.dispose?.();
        if(entry.mesh.material) entry.mesh.material.dispose?.();
    } catch(e) {
        // ignore cleanup errors
    }
    gridMap.delete(key);
}

function buildGridAround(lonCenter, latCenter) {
    // compute integer steps and create needed meshes
    const newKeys = new Set();

    for(let i = -GRID_RADIUS_STEPS; i <= GRID_RADIUS_STEPS; i++) {
        for(let j = -GRID_RADIUS_STEPS; j <= GRID_RADIUS_STEPS; j++) {
            const lon = lonCenter + (i * GRID_SPACING_DEG);
            const lat = latCenter + (j * GRID_SPACING_DEG);
            const key = keyFor(lon, lat);
            newKeys.add(key);
            if(!gridMap.has(key)) {
                const colour = 0x0077ff + ((i+j) & 1 ? 0x003300 : 0x000000);
                const mesh = makeBoxMesh(colour);
                try {
                    locar.add(mesh, lon, lat);
                } catch(e) {
                    // fallback: position manually and add to scene
                    mesh.position.set(0,0,0);
                    scene.add(mesh);
                }
                gridMap.set(key, {mesh, lon, lat});
            }
        }
    }

    // remove keys not in newKeys
    for(const key of Array.from(gridMap.keys())) {
        if(!newKeys.has(key)) {
            removeGridKey(key);
        }
    }

    lastGridCenter = {lon: lonCenter, lat: latCenter};
    updateStatus();
}

// Helper: small distance check (in degrees)
function movedEnough(oldPos, newPos) {
    if(!oldPos) return true;
    const dLon = Math.abs(oldPos.lon - newPos.lon);
    const dLat = Math.abs(oldPos.lat - newPos.lat);
    return (dLon > (GRID_SPACING_DEG/2) || dLat > (GRID_SPACING_DEG/2));
}

locar.on("gpsupdate", ev => {
    const lon = ev.position.coords.longitude;
    const lat = ev.position.coords.latitude;

    // show a toast for the very first GPS fix
    if(firstLocation) {
        alert(`Got the initial location: longitude ${lon}, latitude ${lat}`);
        firstLocation = false;
    }

    const center = {lon, lat};
    if(!movedEnough(lastGridCenter, center)) {
        // skip expensive grid rebuild if user hasn't moved beyond threshold
        return;
    }

    buildGridAround(lon, lat);
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
