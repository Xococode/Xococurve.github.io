// Definir la variable curveType globalmente
let curveType = 'LineCurve3'; // Tipo de curva por defecto

// Clase Curva3D para encapsular cada curva y sus puntos de control
class Curva3D {
    constructor(type, puntos, escena) {
        this.type = type;
        this.puntos = puntos; // Array de THREE.Mesh (puntos de control)
        this.escena = escena; // Referencia a la escena de Three.js
        this.curve = this.crearCurva();
        this.curveObject = this.crearCurveObject();
        this.asociarPuntos();
    }

    crearCurva() {
        switch (this.type) {
            case 'LineCurve3':
                return new THREE.LineCurve3(this.puntos[0].position, this.puntos[1].position);
            case 'QuadraticBezierCurve3':
                return new THREE.QuadraticBezierCurve3(this.puntos[0].position, this.puntos[1].position, this.puntos[2].position);
            case 'CubicBezierCurve3':
                return new THREE.CubicBezierCurve3(this.puntos[0].position, this.puntos[1].position, this.puntos[2].position, this.puntos[3].position);
            case 'CatmullRomCurve3':
                return new THREE.CatmullRomCurve3(this.puntos.map(p => p.position.clone()));
            default:
                console.error('Tipo de curva no soportado:', this.type);
                return null;
        }
    }

    crearCurveObject() {
        if (!this.curve) return null;
        const points = this.curve.getPoints(200);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x0000ff });
        const curveObject = new THREE.Line(geometry, material);
        this.escena.add(curveObject);
        return curveObject;
    }

    asociarPuntos() {
        this.puntos.forEach(punto => {
            const cp = controlPoints.find(cp => cp.position.equals(punto.position));
            if (cp) {
                cp.curva3D = this; // Asignar la referencia de la curva a cada punto
                console.log(`Punto (${cp.position.x}, ${cp.position.y}, ${cp.position.z}) asociado a la curva ${this.type}`);
            }
        });
    }

    actualizarCurva() {
        switch (this.type) {
            case 'LineCurve3':
                this.curve = new THREE.LineCurve3(this.puntos[0].position, this.puntos[1].position);
                break;
            case 'QuadraticBezierCurve3':
                this.curve = new THREE.QuadraticBezierCurve3(this.puntos[0].position, this.puntos[1].position, this.puntos[2].position);
                break;
            case 'CubicBezierCurve3':
                this.curve = new THREE.CubicBezierCurve3(this.puntos[0].position, this.puntos[1].position, this.puntos[2].position, this.puntos[3].position);
                break;
            case 'CatmullRomCurve3':
                this.curve = new THREE.CatmullRomCurve3(this.puntos.map(p => p.position.clone()));
                break;
            default:
                console.error('Tipo de curva no soportado:', this.type);
                return;
        }

        if (this.curve && this.curveObject) {
            const nuevosPuntos = this.curve.getPoints(200);
            this.curveObject.geometry.setFromPoints(nuevosPuntos);
            this.curveObject.geometry.attributes.position.needsUpdate = true;
            console.log(`Curva ${this.type} actualizada.`);
        }
    }
}

// Variables globales
let scene, camera, renderer, raycaster, mouse, orbitControls, transformControls;
let points = []; // Puntos seleccionados por el usuario para la curva actual
let isCursorMode = false;
let snapEnabled = false; // Control para activar/desactivar la función snap
let proximityThreshold = 1.0; // Valor inicial de proximidad, controlable desde la UI
let selectedObject = null;
const controlPoints = []; // Array para almacenar puntos de control
let currentTransformChangeHandler = null; // Almacenar el manejador actual para eliminarlo correctamente
const curvas3D = []; // Array para almacenar todas las instancias de Curva3D

// Número de puntos necesarios por tipo de curva
const curvePointsCount = {
    'LineCurve3': 2,
    'QuadraticBezierCurve3': 3,
    'CubicBezierCurve3': 4, // Añadido para Curva Cúbica 3D
    'CatmullRomCurve3': 4, // Al menos 4 puntos para Catmull-Rom 3D
};

// Función de inicialización
function init() {
    // Crear la escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);

    // Crear la cámara
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(30, 30, 30);
    camera.lookAt(0, 0, 0);

    // Crear el renderizador
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Raycaster para interactuar con el mouse
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Crear una rejilla y asignarle un nombre para identificarla
    const gridHelper = new THREE.GridHelper(100, 100);
    gridHelper.name = 'GridHelper';
    scene.add(gridHelper);

    // OrbitControls para orbitar, hacer zoom y paneo
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true; // Movimiento más suave
    orbitControls.dampingFactor = 0.05;

    // TransformControls para manipular objetos (mover, rotar, escalar)
    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('change', render);
    transformControls.addEventListener('dragging-changed', function (event) {
        orbitControls.enabled = !event.value;
    });
    scene.add(transformControls);

    // Escuchar eventos del ratón
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('click', onMouseClick, false);

    // Añadir listener para la tecla ESC
    document.addEventListener('keydown', onKeyDown, false);

    // Ajustar ventana al cambiar de tamaño
    window.addEventListener('resize', onWindowResize, false);

    // Botones de la interfaz
    setupUI();

    animate();
}

// Evento de clic en el ratón para seleccionar o añadir puntos de control
function onMouseClick(event) {
    raycaster.setFromCamera(mouse, camera);
    const intersectedControlPoints = raycaster.intersectObjects(controlPoints);

    if (intersectedControlPoints.length > 0) {
        // Si se clicó en un punto de control existente
        const selectedPoint = intersectedControlPoints[0].object;
        selectControlPoint(selectedPoint);
    } else if (isCursorMode) {
        // Si no se clicó en un punto de control y el modo cursor está activado, añadir un nuevo punto
        const gridHelper = scene.getObjectByName('GridHelper');
        const intersectedGrid = raycaster.intersectObject(gridHelper, true);

        if (intersectedGrid.length > 0) {
            const point = intersectedGrid[0].point;
            const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
            const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const controlPoint = new THREE.Mesh(sphereGeometry, sphereMaterial);
            controlPoint.position.copy(point);
            scene.add(controlPoint);
            controlPoints.push(controlPoint);
            console.log(`Punto de control añadido en: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);

            // Añadir el punto al array temporal
            points.push(controlPoint);

            const requiredPoints = getRequiredPoints(curveType);

            if (requiredPoints > 0 && points.length === requiredPoints) {
                // Crear la curva utilizando los puntos añadidos
                crearCurva3D(curveType, points.slice()); // Pasar una copia de los puntos
                points = []; // Resetear los puntos temporales
            }
        }
    }
}

// Función para crear una instancia de Curva3D
function crearCurva3D(tipo, puntosDeControl) {
    console.log(`Creando curva de tipo: ${tipo}`);
    console.log(`Número de puntos proporcionados: ${puntosDeControl.length}`);

    if (puntosDeControl.length !== curvePointsCount[tipo]) {
        console.error(`Número incorrecto de puntos para ${tipo}. Se requieren ${curvePointsCount[tipo]} puntos.`);
        alert(`Número incorrecto de puntos para ${tipo}. Se requieren ${curvePointsCount[tipo]} puntos.`);
        return;
    }

    const nuevaCurva = new Curva3D(tipo, puntosDeControl, scene);
    curvas3D.push(nuevaCurva);
    console.log(`Curva ${tipo} creada y añadida a curvas3D.`);
}

// Seleccionar un punto de control
function selectControlPoint(controlPoint) {
    transformControls.attach(controlPoint);
    selectedObject = controlPoint;

    // Mostrar la posición del punto seleccionado en los inputs de la UI
    updateUIWithSelectedPointPosition(controlPoint.position);

    // Remover cualquier listener anterior antes de agregar uno nuevo
    if (currentTransformChangeHandler) {
        transformControls.removeEventListener('objectChange', currentTransformChangeHandler);
    }

    // Definir un nuevo listener para el evento objectChange y almacenarlo en currentTransformChangeHandler
    currentTransformChangeHandler = () => {
        if (snapEnabled) {
            // Comprobar si hay algún punto cercano y ajustar su posición
            snapToNearbyControlPoint(selectedObject);
        }

        // Actualizar la curva asociada
        if (selectedObject.curva3D) {
            selectedObject.curva3D.actualizarCurva();
        }

        // Actualizar la UI con la nueva posición del punto mientras se mueve
        updateUIWithSelectedPointPosition(selectedObject.position);
    };

    // Agregar el nuevo listener
    transformControls.addEventListener('objectChange', currentTransformChangeHandler);
}

// Función para configurar los botones y elementos de la interfaz
function setupUI() {
    const curveTypeSelector = document.getElementById('curveType');
    const createCurveButton = document.getElementById('createCurveButton');
    const cursorModeButton = document.getElementById('cursorModeButton');
    const toggleSnapButton = document.getElementById('toggleSnap');
    const proximityThresholdInput = document.getElementById('proximityThresholdInput');
    const transformModeTranslate = document.getElementById('transformModeTranslate');
    const transformModeRotate = document.getElementById('transformModeRotate');
    const transformModeScale = document.getElementById('transformModeScale');
    const updatePointPositionButton = document.getElementById('updatePointPosition');

    // Listener para el cambio de tipo de curva
    curveTypeSelector.addEventListener('change', (event) => {
        curveType = event.target.value; // Asegurarse de tomar el valor seleccionado
        console.log(`Tipo de curva seleccionado: ${curveType}`);
    });

    // Listener para crear curva manualmente (sin usar Modo Cursor)
    createCurveButton.addEventListener('click', () => {
        if (['LineCurve3', 'QuadraticBezierCurve3', 'CubicBezierCurve3', 'CatmullRomCurve3'].includes(curveType)) {
            const requiredPoints = getRequiredPoints(curveType);
            if (points.length < requiredPoints) {
                alert(`Seleccione ${requiredPoints} puntos en la escena para crear la curva ${curveType}.`);
                return;
            }
            crearCurva3D(curveType, points.slice()); // Pasar una copia de los puntos
            points = []; // Resetear los puntos temporales
        } else {
            alert('Tipo de curva no soportado.');
        }
    });

    // Alternar modo cursor para crear curvas con clics
    cursorModeButton.addEventListener('click', () => {
        isCursorMode = !isCursorMode;
        cursorModeButton.textContent = isCursorMode ? 'Modo Cursor: ON' : 'Modo Cursor: OFF';
        if (isCursorMode) {
            const requiredPoints = getRequiredPoints(curveType);
            if (requiredPoints > 0) {
                alert(`Modo Cursor activado. Seleccione ${requiredPoints} puntos en la escena para crear la curva ${curveType}.`);
            }
        }
    });

    // Botón para activar o desactivar el snap
    toggleSnapButton.addEventListener('click', () => {
        snapEnabled = !snapEnabled;
        toggleSnapButton.textContent = snapEnabled ? 'Activar Snap: ON' : 'Activar Snap: OFF';
        console.log(`Snapping ${snapEnabled ? 'activado' : 'desactivado'}.`);
    });

    // Input para ajustar el valor del umbral de proximidad
    proximityThresholdInput.addEventListener('input', () => {
        proximityThreshold = parseFloat(proximityThresholdInput.value);
        console.log(`Umbral de proximidad para snapping: ${proximityThreshold}`);
    });

    // Botón para actualizar la posición del punto seleccionado desde la UI
    updatePointPositionButton.addEventListener('click', updateSelectedPointPosition);

    // Botones para cambiar el modo de TransformControls
    transformModeTranslate.addEventListener('click', () => {
        transformControls.setMode('translate');
        console.log('Modo TransformControls: Mover');
    });

    transformModeRotate.addEventListener('click', () => {
        transformControls.setMode('rotate');
        console.log('Modo TransformControls: Rotar');
    });

    transformModeScale.addEventListener('click', () => {
        transformControls.setMode('scale');
        console.log('Modo TransformControls: Escalar');
    });
}

// Función para determinar si una curva requiere más puntos
function requiresAdditionalPoints(type) {
    return curvePointsCount[type] > 0;
}

// Función para obtener el número de puntos requeridos para una curva
function getRequiredPoints(type) {
    return curvePointsCount[type] || 2;
}

// Función para actualizar la interfaz con la posición del punto seleccionado
function updateUIWithSelectedPointPosition(position) {
    document.getElementById('selectedX').value = position.x.toFixed(2);
    document.getElementById('selectedY').value = position.y.toFixed(2);
    document.getElementById('selectedZ').value = position.z.toFixed(2);
}

// Función para actualizar la posición del punto seleccionado desde la UI
function updateSelectedPointPosition() {
    if (selectedObject) {
        const x = parseFloat(document.getElementById('selectedX').value);
        const y = parseFloat(document.getElementById('selectedY').value);
        const z = parseFloat(document.getElementById('selectedZ').value);
        selectedObject.position.set(x, y, z);
        console.log(`Punto de control movido a: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);

        // Actualizar la curva asociada
        if (selectedObject.curva3D) {
            selectedObject.curva3D.actualizarCurva();
        }

        render();
    }
}

// Función para manejar snapping
function snapToNearbyControlPoint(point) {
    controlPoints.forEach(cp => {
        if (cp === point) return; // Ignorar el punto actual

        const distance = point.position.distanceTo(cp.position);
        if (distance < proximityThreshold) { // Usar el umbral definido por el usuario
            point.position.copy(cp.position);
            console.log('Snapping aplicado.');

            // Actualizar la curva asociada después del snapping
            if (point.curva3D) {
                point.curva3D.actualizarCurva();
            }
        }
    });
}

// Función para manejar la deselección con ESC
function onKeyDown(event) {
    if (event.key === 'Escape') {
        // Deseleccionar el objeto actual
        transformControls.detach();
        selectedObject = null;
        console.log('Objeto deseleccionado.');
    }
}

// Función para actualizar la posición del ratón
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// Función para actualizar el tamaño del renderizador al cambiar de tamaño de la ventana
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
    console.log('Ventana redimensionada.');
}

// Bucle de animación
function animate() {
    requestAnimationFrame(animate);
    orbitControls.update(); // Actualizar los controles de órbita
    render();
}

// Renderizar la escena
function render() {
    renderer.render(scene, camera);
}

// Inicializar la aplicación
init();
