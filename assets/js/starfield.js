// Three.js starfield module (lazy-loaded)
// This module exports a single initializer so that the heavy WebGL logic
// stays out of the main bundle and only runs on the homepage.

function debounce(fn, wait = 100) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(null, args), wait);
    };
}

export function initThreeJsStarfield() {
    const currentPath = window.location.pathname;
    if (currentPath !== '/' && currentPath !== '/index.html') {
        return;
    }

    const container = document.getElementById('starfield-container');
    const canvas = document.getElementById('starfield-canvas');

    if (!container || !canvas || typeof THREE === 'undefined') {
        console.log('📦 Three.js 星空效果：容器未找到或 Three.js 未加载');
        return;
    }

    console.log('🌟 初始化 Three.js 星空效果（延迟加载模块）');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const starCount = 2000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;
        const radius = 50 + Math.random() * 150;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        starPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starPositions[i3 + 2] = radius * Math.cos(phi);

        const colorChoice = Math.random();
        if (colorChoice < 0.3) {
            starColors[i3] = 0.4 + Math.random() * 0.2;
            starColors[i3 + 1] = 0.5 + Math.random() * 0.3;
            starColors[i3 + 2] = 0.9 + Math.random() * 0.1;
        } else if (colorChoice < 0.6) {
            starColors[i3] = 0.6 + Math.random() * 0.3;
            starColors[i3 + 1] = 0.3 + Math.random() * 0.2;
            starColors[i3 + 2] = 0.9 + Math.random() * 0.1;
        } else if (colorChoice < 0.8) {
            starColors[i3] = 0.9 + Math.random() * 0.1;
            starColors[i3 + 1] = 0.9 + Math.random() * 0.1;
            starColors[i3 + 2] = 0.95 + Math.random() * 0.05;
        } else {
            starColors[i3] = 0.3 + Math.random() * 0.2;
            starColors[i3 + 1] = 0.8 + Math.random() * 0.2;
            starColors[i3 + 2] = 0.9 + Math.random() * 0.1;
        }

        starSizes[i] = Math.random() * 2 + 0.5;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

    const starMaterial = new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const nebulaGroup = new THREE.Group();
    const nebulaColors = [0x6366f1, 0x8b5cf6, 0xec4899, 0x06b6d4];

    for (let i = 0; i < 5; i++) {
        const nebulaGeometry = new THREE.SphereGeometry(15 + Math.random() * 20, 32, 32);
        const nebulaMaterial = new THREE.MeshBasicMaterial({
            color: nebulaColors[Math.floor(Math.random() * nebulaColors.length)],
            transparent: true,
            opacity: 0.03 + Math.random() * 0.02,
            side: THREE.DoubleSide
        });
        const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);

        nebula.position.set(
            (Math.random() - 0.5) * 60,
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 60 - 30
        );

        nebulaGroup.add(nebula);
    }
    scene.add(nebulaGroup);

    camera.position.z = 50;

    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    container.addEventListener('mousemove', (event) => {
        const rect = container.getBoundingClientRect();
        mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    });

    let animationId;
    function animate() {
        animationId = requestAnimationFrame(animate);

        targetX += (mouseX * 0.5 - targetX) * 0.02;
        targetY += (mouseY * 0.5 - targetY) * 0.02;

        stars.rotation.y += 0.0003;
        stars.rotation.x += 0.0001;

        camera.position.x = targetX * 10;
        camera.position.y = targetY * 10;
        camera.lookAt(scene.position);

        nebulaGroup.rotation.y += 0.0002;
        nebulaGroup.children.forEach((nebula, i) => {
            nebula.rotation.x += 0.001 * (i + 1) * 0.1;
            nebula.rotation.y += 0.001 * (i + 1) * 0.1;
        });

        renderer.render(scene, camera);
    }

    animate();

    const handleResize = debounce(() => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }, 100);

    window.addEventListener('resize', handleResize);

    window.addEventListener('beforeunload', () => {
        cancelAnimationFrame(animationId);
        renderer.dispose();
        starGeometry.dispose();
        starMaterial.dispose();
    });

    console.log('✅ Three.js 星空效果初始化完成（模块化）');
}
