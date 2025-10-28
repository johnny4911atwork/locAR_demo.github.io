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

// Grid management: track added cells so we can remove ones that fall outside the radius
const gridMap = new Map(); // key -> { mesh, lon, lat }

// configuration: cell size in degrees and radius in cells
const cellSize = 0.00001; // ~1.11m in latitude (approx), adjust as needed
const radiusCells = 1; // will produce a (2*radiusCells+1)^2 grid around user

const boxGeom = new THREE.BoxGeometry(10,10,10);

function cellKey(lon, lat) {
    // round to avoid floating point noise
    return `${lon.toFixed(8)}_${lat.toFixed(8)}`;
}

function colourForOffset(dx, dy) {
    // simple deterministic color mapping per direction
    if(dx === 0 && dy === 0) return 0x888888; // center grey
    if(dx > 0 && dy === 0) return 0x00ff00; // east green
    if(dx < 0 && dy === 0) return 0xffff00; // west yellow
    if(dx === 0 && dy > 0) return 0xff0000; // north red
    if(dx === 0 && dy < 0) return 0x00ffff; // south cyan
    // diagonal
    return 0xffffff - ((dx + radiusCells) * 0x111111) - ((dy + radiusCells) * 0x010101);
}

function addCell(lon, lat, dx, dy) {
    const key = cellKey(lon, lat);
    if(gridMap.has(key)) return; // already added

    const mesh = new THREE.Mesh(
        boxGeom,
        new THREE.MeshBasicMaterial({ color: colourForOffset(dx, dy) })
    );

    // register with locar so it will position the mesh according to lat/lon
    try {
        locar.add(mesh, lon, lat);
    } catch (e) {
        // if locar.add throws or isn't available, still add to scene as fallback
        scene.add(mesh);
    }

    gridMap.set(key, { mesh, lon, lat });
}

function removeCell(key) {
    const rec = gridMap.get(key);
    if(!rec) return;

    const { mesh } = rec;

    // attempt to remove from locar first if supported
    try {
        if(typeof locar.remove === 'function') {
            locar.remove(mesh);
        }
    } catch (e) {
        // ignore
    }

    // also remove from three scene to be safe
    try {
        scene.remove(mesh);
    } catch (e) {}

    // dispose geometry/material where possible
    try { mesh.geometry.dispose(); } catch(e) {}
    try { mesh.material.dispose(); } catch(e) {}

    gridMap.delete(key);
}

function updateGrid(centerLon, centerLat) {
    const wanted = new Set();

    for(let dx = -radiusCells; dx <= radiusCells; dx++) {
        for(let dy = -radiusCells; dy <= radiusCells; dy++) {
            const lon = centerLon + dx * cellSize;
            const lat = centerLat + dy * cellSize;
            const key = cellKey(lon, lat);
            wanted.add(key);
            if(!gridMap.has(key)) {
                addCell(lon, lat, dx, dy);
            }
        }
    }

    // remove any cells not in wanted set
    for(const key of Array.from(gridMap.keys())) {
        if(!wanted.has(key)) {
            removeCell(key);
        }
    }
}

locar.on("gpsupdate", ev => {
    const lon = ev.position.coords.longitude;
    const lat = ev.position.coords.latitude;

    if(firstLocation) {
        alert(`Got the initial location: longitude ${lon}, latitude ${lat}`);
        firstLocation = false;
    }

    // update grid around the user's current location
    updateGrid(lon, lat);
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
