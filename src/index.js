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

// Grid configuration: gridSize must be odd (3,5,7...), spacing in meters between cells
const gridConfig = {
    gridSize: 3,
    spacingMeters: 2
};

// Map to hold generated cells by key "col,row"
const gridCells = new Map();

// Helpers: approximate meters -> degrees conversions
function metersToLatDegrees(meters) {
    // 1 deg latitude ~= 111320 meters
    return meters / 111320;
}

function metersToLonDegrees(meters, latitude) {
    // 1 deg longitude ~= 111320 * cos(lat)
    return meters / (111320 * Math.cos(latitude * Math.PI / 180));
}

// Create a mesh for each grid cell (simple plane)
function createCellMesh(col, row) {
    const size = 1; // plane size in three.js units (arbitrary)
    const geom = new THREE.PlaneGeometry(size, size);
    const color = 0x00ff00;
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2; // make horizontal
    // store meta so we can identify
    mesh.userData.grid = { col, row };
    return mesh;
}

// Update grid around center lon/lat
function updateGrid(centerLon, centerLat) {
    const half = Math.floor(gridConfig.gridSize / 2);
    const spacing = gridConfig.spacingMeters;

    // Build set of required keys
    const required = new Set();

    for (let r = -half; r <= half; r++) {
        for (let c = -half; c <= half; c++) {
            const key = `${c},${r}`;
            required.add(key);

            if (!gridCells.has(key)) {
                // compute lon/lat offset for this cell
                const lonOffset = metersToLonDegrees(c * spacing, centerLat);
                const latOffset = metersToLatDegrees(r * spacing);
                const cellLon = centerLon + lonOffset;
                const cellLat = centerLat + latOffset;

                const mesh = createCellMesh(c, r);
                // add via locar so it's placed in AR world
                locar.add(mesh, cellLon, cellLat);
                gridCells.set(key, { mesh, lon: cellLon, lat: cellLat });
            }
        }
    }

    // Remove cells not required anymore
    for (const key of Array.from(gridCells.keys())) {
        if (!required.has(key)) {
            const entry = gridCells.get(key);
            // Remove from locar/scene
            try {
                scene.remove(entry.mesh);
            } catch (e) {}
            if (entry.mesh.geometry) entry.mesh.geometry.dispose();
            if (entry.mesh.material) entry.mesh.material.dispose();
            gridCells.delete(key);
        }
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
    // On every GPS update, refresh the small grid centered on user
    const lon = ev.position.coords.longitude;
    const lat = ev.position.coords.latitude;
    updateGrid(lon, lat);
    if (firstLocation) {
        alert(`Got the initial location: longitude ${lon}, latitude ${lat}`);
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
