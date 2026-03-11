import * as THREE from 'three';
import { InteractableProp } from './interactableProp.js';
import { WORLD_HALF, WORLD_SCALE } from './sceneConstants.js';

// Scene object methods that are primarily responsible for world/environment
// generation and seeded prop creation.
export const sceneGenerationMethods = {
    _buildStars() {
        const N = 3000;
        const positions = new Float32Array(N * 3);
        const sizes = new Float32Array(N);
        const phases = new Float32Array(N);
        const colors = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 4000 + Math.random() * 1000;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            sizes[i] = 0.6 + Math.random() * 2.8;
            phases[i] = Math.random() * Math.PI * 2;
            const rnd = Math.random();
            if (rnd < 0.08) {
                colors[i * 3] = 1;
                colors[i * 3 + 1] = 0.9;
                colors[i * 3 + 2] = 0.7;
            } else if (rnd < 0.14) {
                colors[i * 3] = 0.7;
                colors[i * 3 + 1] = 0.8;
                colors[i * 3 + 2] = 1;
            } else {
                colors[i * 3] = 1;
                colors[i * 3 + 1] = 1;
                colors[i * 3 + 2] = 1;
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uGlobalAlpha: { value: 1 } },
            vertexShader: `
                attribute float starSize; attribute float phase; attribute vec3 starColor;
                varying vec3 vColor; varying float vTwinkle;
                uniform float uTime;
                void main() {
                    vColor = starColor;
                    vTwinkle = 0.5 + 0.5 * sin(uTime * 2.0 + phase);
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = starSize * vTwinkle * (300.0 / -mvPos.z);
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                varying vec3 vColor; varying float vTwinkle;
                uniform float uGlobalAlpha;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    float alpha = (1.0 - d * 2.0) * vTwinkle * uGlobalAlpha;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this.starMaterial = mat;
        this.stars = new THREE.Points(geo, mat);
        this.stars.visible = !this.isLight;
        this.scene.add(this.stars);

        this._buildGalaxy();
    },

    _buildGalaxy() {
        const geo = new THREE.PlaneGeometry(5000, 2000);
        const mat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    vec2 c = vUv - vec2(0.5, 0.5);
                    float d = length(c * vec2(1.0, 2.5));
                    float band = 1.0 - smoothstep(0.0, 0.5, abs(c.y * 3.5 - c.x * 0.4));
                    float core = exp(-d * 2.5) * 0.15;
                    float glow = band * exp(-abs(c.y * 6.0)) * 0.06;
                    vec3 col = mix(vec3(0.18, 0.1, 0.35), vec3(0.4, 0.3, 0.8), core + glow);
                    gl_FragColor = vec4(col, (core + glow) * 0.7);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const galaxy = new THREE.Mesh(geo, mat);
        galaxy.rotation.x = -Math.PI / 6;
        galaxy.rotation.z = Math.PI / 5;
        galaxy.position.set(0, 300, -3500);
        galaxy.visible = true;
        this.galaxy = galaxy;
        this.scene.add(galaxy);
        if (this.stars) {
            this.galaxy.visible = !this.isLight;
        }
    },

    _buildMoon() {
        const geo = new THREE.CircleGeometry(60, 64);
        const mat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    vec2 c = vUv - vec2(0.5);
                    float d = length(c);
                    if (d > 0.5) discard;
                    float edge = 1.0 - smoothstep(0.44, 0.5, d);

                    vec2 shadowCenter = c - vec2(0.18, -0.1);
                    float shadowD = length(shadowCenter);
                    float lit = smoothstep(0.30, 0.48, shadowD);

                    vec3 darkSide = vec3(0.42, 0.40, 0.38);
                    vec3 brightSide = vec3(0.98, 0.96, 0.85);
                    vec3 moonCol = mix(darkSide, brightSide, lit);

                    gl_FragColor = vec4(moonCol, edge);
                }
            `,
            transparent: true,
            depthWrite: false
        });
        this.moon = new THREE.Mesh(geo, mat);
        this.moon.position.set(-800, 700, -2500);
        this.moon.visible = !this.isLight;
        this.scene.add(this.moon);

        const glowGeo = new THREE.CircleGeometry(180, 32);
        const glowMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); float a = (1.0 - smoothstep(0.2, 0.5, d)) * 0.18; gl_FragColor = vec4(0.9, 0.95, 1.0, a); }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(this.moon.position);
        glow.visible = !this.isLight;
        this.moonGlow = glow;
        this.scene.add(glow);

        const sunGeo = new THREE.CircleGeometry(70, 64);
        const sunMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); if(d > 0.5) discard; vec3 col = mix(vec3(1.0, 0.98, 0.7), vec3(1.0, 0.85, 0.3), d * 2.0); float a = 1.0 - smoothstep(0.42, 0.5, d); gl_FragColor = vec4(col, a); }`,
            transparent: true,
            depthWrite: false
        });
        this.sun = new THREE.Mesh(sunGeo, sunMat);
        this.sun.position.set(900, 700, -2500);
        this.sun.visible = this.isLight;
        this.scene.add(this.sun);

        const sunGlowGeo = new THREE.CircleGeometry(300, 32);
        const sunGlowMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); float a = (1.0 - smoothstep(0.1, 0.5, d)) * 0.25; gl_FragColor = vec4(1.0, 0.95, 0.5, a); }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
        sunGlow.position.copy(this.sun.position);
        sunGlow.visible = this.isLight;
        this.sunGlow = sunGlow;
        this.scene.add(sunGlow);
    },

    _buildClouds() {
        this.clouds = [];
        const cloudData = [
            { x: -700, y: 380, z: -600, scale: 1.4, type: 'normal' },
            { x: 300, y: 440, z: 700, scale: 1.0, type: 'normal' },
            { x: 900, y: 360, z: -500, scale: 0.8, type: 'wispy' },
            { x: -300, y: 500, z: 800, scale: 1.2, type: 'large' },
            { x: 600, y: 300, z: 400, scale: 0.7, type: 'wispy' },
            { x: -1400, y: 450, z: -550, scale: 1.6, type: 'large' },
            { x: 1200, y: 520, z: 900, scale: 1.1, type: 'normal' },
            { x: -500, y: 280, z: 350, scale: 0.6, type: 'wispy' },
            { x: 1500, y: 400, z: -650, scale: 1.3, type: 'large' },
            { x: -1100, y: 340, z: 450, scale: 0.9, type: 'normal' },
            { x: 400, y: 560, z: 750, scale: 1.8, type: 'storm' },
            { x: -800, y: 600, z: -1000, scale: 2.0, type: 'large' },
            { x: 1800, y: 320, z: 500, scale: 0.5, type: 'wispy' },
            { x: -1600, y: 480, z: -700, scale: 1.5, type: 'storm' },
            { x: 0, y: 550, z: 850, scale: 1.0, type: 'wispy' },
        ];
        cloudData.forEach((d, idx) => {
            const cloud = d.type === 'wispy' ? this._makeWispyCloud(d.scale)
                : d.type === 'large' ? this._makeLargeCumulus(d.scale)
                    : d.type === 'storm' ? this._makeStormCloud(d.scale)
                        : this._makeCloud(d.scale);
            cloud.position.set(d.x, d.y, d.z);
            cloud.userData.baseX = d.x;
            cloud.userData.speed = 0.03 + (idx % 5) * 0.008;
            cloud.renderOrder = -10;
            cloud.visible = this.isLight;
            this.clouds.push(cloud);
            this.scene.add(cloud);
        });
    },

    _buildFireflies() {
        const count = 120;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 6000;
            positions[i * 3 + 1] = Math.random() * 800 + 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 6000;
            phases[i] = Math.random() * Math.PI * 2;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        const mat = new THREE.PointsMaterial({
            color: 0xaaffaa,
            size: 5,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this._fireflies = new THREE.Points(geo, mat);
        this._fireflies.visible = !this.isLight;
        this._fireflyPhases = phases;
        this.scene.add(this._fireflies);
    },

    _buildSkyIslands() {
        const islandData = [
            { x: -900, y: 200, z: -800, rx: 2.0, name: '관악 샤 아일랜드', university: '서울대학교', landmark: '서울대학교 · 서울대 정문·샤 조형물', type: 'forest', admissionUrl: 'https://admission.snu.ac.kr', admissionNote: '수시/정시 모집요강과 전형별 공지 확인' },
            { x: 700, y: 250, z: 600, rx: 1.6, name: '신촌 독수리 아일랜드', university: '연세대학교', landmark: '연세대학교 · 언더우드관·독수리 상징', type: 'crystal', admissionUrl: 'https://admission.yonsei.ac.kr', admissionNote: '전형 일정 및 모집 단위 확인' },
            { x: 200, y: 180, z: -1000, rx: 1.2, name: '안암 호랑이 아일랜드', university: '고려대학교', landmark: '고려대학교 · 중앙광장·호랑이 상징', type: 'misty', admissionUrl: 'https://oku.korea.ac.kr', admissionNote: '정시/수시 입학전형 세부사항 확인' },
            { x: -1200, y: 300, z: 400, rx: 1.8, name: '대덕 사이언스 아일랜드', university: '카이스트', landmark: 'KAIST · 본원 상징 조형·과학광장', type: 'waterfall', admissionUrl: 'https://admission.kaist.ac.kr', admissionNote: '창의도전전형 및 일반전형 안내 확인' },
            { x: 1400, y: 220, z: -700, rx: 2.2, name: '포스텍 스틸 아일랜드', university: '포항공과대학교', landmark: 'POSTECH · 지곡회관·상징 조형물', type: 'flower', admissionUrl: 'https://adm.postech.ac.kr', admissionNote: '입학전형/장학제도/공지사항 확인' },
            { x: -1600, y: 280, z: -900, rx: 1.4, name: '인문명륜 아일랜드', university: '성균관대학교', landmark: '성균관대학교 · 명륜당·은행나무 상징', type: 'rock', admissionUrl: 'https://admission.skku.edu', admissionNote: '캠퍼스별 모집요강 및 전형안내 확인' },
            { x: 500, y: 190, z: 1200, rx: 1.9, name: '사자 한양 아일랜드', university: '한양대학교', landmark: '한양대학교 · 사자상·본관 라인', type: 'star', admissionUrl: 'https://go.hanyang.ac.kr', admissionNote: '전형 일정, 경쟁률, 모집요강 확인' },
            { x: -600, y: 260, z: 500, rx: 1.5, name: '흑석 청룡 아일랜드', university: '중앙대학교', landmark: '중앙대학교 · 청룡상·중앙마루', type: 'aurora', admissionUrl: 'https://admission.cau.ac.kr', admissionNote: '학과별 전형요소 및 합격자 발표일 확인' },
            { x: 1800, y: 240, z: 400, rx: 2.4, name: '평화의 전당 아일랜드', university: '경희대학교', landmark: '경희대학교 · 평화의전당·캠퍼스 로드', type: 'fortress', admissionUrl: 'https://iphak.khu.ac.kr', admissionNote: '캠퍼스별 모집 인원과 전형계획 확인' },
            { x: -2000, y: 310, z: 600, rx: 1.3, name: '서강 알바트로스 아일랜드', university: '서강대학교', landmark: '서강대학교 · 본관·알바트로스 상징', type: 'moon', admissionUrl: 'https://admission.sogang.ac.kr', admissionNote: '모집요강, FAQ, 공지사항 확인' },
            { x: 1100, y: 200, z: -1100, rx: 1.7, name: '이화 유레카 아일랜드', university: '이화여자대학교', landmark: '이화여자대학교 · ECC·유레카 상징', type: 'dragon', admissionUrl: 'https://admission.ewha.ac.kr', admissionNote: '전형별 지원자격 및 제출서류 확인' },
            { x: -400, y: 230, z: -300, rx: 2.1, name: '금정 교정 아일랜드', university: '부산대학교', landmark: '부산대학교 · 금정캠퍼스·정문 상징', type: 'wind', admissionUrl: 'https://go.pusan.ac.kr', admissionNote: '정시/수시 모집단위와 일정 확인' },
        ];

        const typeTheme = {
            forest: { top: 0x4b8f57, cliff: 0x5d432e, accent: 0x9df8a8, glow: 0x4ecf74 },
            crystal: { top: 0x5f90b2, cliff: 0x42546a, accent: 0x9de8ff, glow: 0x49bce5 },
            misty: { top: 0x6f7a92, cliff: 0x4d5668, accent: 0xdbe8ff, glow: 0x9ebce6 },
            waterfall: { top: 0x3e8368, cliff: 0x3d474f, accent: 0x90e5ff, glow: 0x48aeda },
            flower: { top: 0x7ca76a, cliff: 0x65473a, accent: 0xffc0dc, glow: 0xff7cac },
            rock: { top: 0x6a7a66, cliff: 0x4e4c46, accent: 0xe1d8a4, glow: 0xcfba5e },
            star: { top: 0x45557e, cliff: 0x3d3846, accent: 0xfff19b, glow: 0xe3cd57 },
            aurora: { top: 0x4b7d72, cliff: 0x3a4e4a, accent: 0x9dffe5, glow: 0x4fd6b5 },
            fortress: { top: 0x7a7e85, cliff: 0x54565d, accent: 0xbfd7ff, glow: 0x7fa2d8 },
            moon: { top: 0x6d7288, cliff: 0x484a59, accent: 0xd8deff, glow: 0x8ea6ff },
            dragon: { top: 0x7a6448, cliff: 0x4d3423, accent: 0xffcb9d, glow: 0xff8a4f },
            wind: { top: 0x5a887a, cliff: 0x425348, accent: 0xcaf8ff, glow: 0x74d2ef },
            default: { top: 0x4c7a58, cliff: 0x5a4330, accent: 0xa7e3ff, glow: 0x4ca8d8 },
        };

        islandData.forEach(d => {
            const group = new THREE.Group();
            const theme = typeTheme[d.type] || typeTheme.default;

            const topGeo = new THREE.CylinderGeometry(d.rx * 92, d.rx * 74, 34, 16);
            const topMat = new THREE.MeshStandardMaterial({ color: theme.top, roughness: 0.88, metalness: 0.06 });
            const top = new THREE.Mesh(topGeo, topMat);
            top.position.y = 18;
            group.add(top);

            const terraceGeo = new THREE.CylinderGeometry(d.rx * 78, d.rx * 66, 12, 14);
            const terraceMat = new THREE.MeshStandardMaterial({ color: theme.top, roughness: 0.82, metalness: 0.08 });
            const terrace = new THREE.Mesh(terraceGeo, terraceMat);
            terrace.position.y = 32;
            group.add(terrace);

            const cliffGeo = new THREE.CylinderGeometry(d.rx * 60, d.rx * 28, 108, 12);
            const cliffMat = new THREE.MeshStandardMaterial({ color: theme.cliff, roughness: 0.96, metalness: 0.04 });
            const cliff = new THREE.Mesh(cliffGeo, cliffMat);
            cliff.position.y = -30;
            group.add(cliff);

            const undersideGeo = new THREE.ConeGeometry(d.rx * 20, d.rx * 58, 9);
            const undersideMat = new THREE.MeshStandardMaterial({ color: theme.cliff, roughness: 1.0, metalness: 0.0 });
            const underside = new THREE.Mesh(undersideGeo, undersideMat);
            underside.position.y = -110;
            group.add(underside);

            for (let s = 0; s < 5; s++) {
                const shardGeo = new THREE.DodecahedronGeometry(d.rx * (4.5 + Math.random() * 2.5), 0);
                const shardMat = new THREE.MeshStandardMaterial({ color: theme.cliff, roughness: 1.0, metalness: 0.0 });
                const shard = new THREE.Mesh(shardGeo, shardMat);
                const a = (s / 5) * Math.PI * 2 + Math.random() * 0.25;
                shard.position.set(Math.cos(a) * d.rx * 22, -95 - Math.random() * 20, Math.sin(a) * d.rx * 22);
                shard.rotation.set(Math.random(), Math.random(), Math.random());
                group.add(shard);
            }

            const plazaGeo = new THREE.CircleGeometry(d.rx * 38, 28);
            const plazaMat = new THREE.MeshStandardMaterial({ color: 0xdbe3f0, roughness: 0.5, metalness: 0.25 });
            const plaza = new THREE.Mesh(plazaGeo, plazaMat);
            plaza.rotation.x = -Math.PI / 2;
            plaza.position.y = 40.5;
            group.add(plaza);

            const hallBodyGeo = new THREE.BoxGeometry(d.rx * 20, d.rx * 16, d.rx * 14);
            const hallBodyMat = new THREE.MeshStandardMaterial({ color: 0xc7cedd, roughness: 0.45, metalness: 0.28 });
            const hallBody = new THREE.Mesh(hallBodyGeo, hallBodyMat);
            hallBody.position.y = 49;
            group.add(hallBody);

            const hallRoofGeo = new THREE.ConeGeometry(d.rx * 12, d.rx * 11, 8);
            const hallRoofMat = new THREE.MeshStandardMaterial({ color: 0x7f8ea8, roughness: 0.5, metalness: 0.2 });
            const hallRoof = new THREE.Mesh(hallRoofGeo, hallRoofMat);
            hallRoof.position.y = 62;
            group.add(hallRoof);

            for (let wing = 0; wing < 4; wing++) {
                const wingGeo = new THREE.BoxGeometry(d.rx * 7, d.rx * 10, d.rx * 5);
                const wingMat = new THREE.MeshStandardMaterial({ color: 0xb7c2d8, roughness: 0.52, metalness: 0.22 });
                const wingMesh = new THREE.Mesh(wingGeo, wingMat);
                const a = (wing / 4) * Math.PI * 2 + Math.PI * 0.25;
                wingMesh.position.set(Math.cos(a) * d.rx * 20, 46, Math.sin(a) * d.rx * 20);
                wingMesh.rotation.y = -a;
                group.add(wingMesh);
            }

            const rimRingGeo = new THREE.TorusGeometry(d.rx * 64, d.rx * 2.1, 12, 56);
            const rimRingMat = new THREE.MeshBasicMaterial({
                color: theme.accent,
                transparent: true,
                opacity: 0.24,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const rimRing = new THREE.Mesh(rimRingGeo, rimRingMat);
            rimRing.rotation.x = Math.PI / 2;
            rimRing.position.y = 24;
            group.add(rimRing);

            for (let p = 0; p < 8; p++) {
                const a = (p / 8) * Math.PI * 2;
                const postGeo = new THREE.CylinderGeometry(d.rx * 1.0, d.rx * 1.2, d.rx * 8, 6);
                const postMat = new THREE.MeshStandardMaterial({ color: 0x8ea0ba, roughness: 0.4, metalness: 0.65 });
                const post = new THREE.Mesh(postGeo, postMat);
                post.position.set(Math.cos(a) * d.rx * 46, 44, Math.sin(a) * d.rx * 46);
                group.add(post);

                const lampGeo = new THREE.SphereGeometry(d.rx * 2.0, 8, 8);
                const lampMat = new THREE.MeshStandardMaterial({
                    color: theme.accent,
                    emissive: theme.glow,
                    emissiveIntensity: 1.0,
                    roughness: 0.25,
                    metalness: 0.45,
                    transparent: true,
                    opacity: 0.9
                });
                const lamp = new THREE.Mesh(lampGeo, lampMat);
                lamp.position.set(Math.cos(a) * d.rx * 46, 49, Math.sin(a) * d.rx * 46);
                group.add(lamp);
            }

            const beaconPoleGeo = new THREE.CylinderGeometry(d.rx * 2.5, d.rx * 3.2, d.rx * 44, 8);
            const beaconPoleMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6, metalness: 0.45 });
            const beaconPole = new THREE.Mesh(beaconPoleGeo, beaconPoleMat);
            beaconPole.position.y = 52;
            group.add(beaconPole);

            const beaconCoreGeo = new THREE.OctahedronGeometry(d.rx * 7.5, 0);
            const beaconCoreMat = new THREE.MeshStandardMaterial({
                color: theme.accent,
                emissive: theme.glow,
                emissiveIntensity: 1.2,
                roughness: 0.22,
                metalness: 0.55,
                transparent: true,
                opacity: 0.88
            });
            const beaconCore = new THREE.Mesh(beaconCoreGeo, beaconCoreMat);
            beaconCore.position.y = 80;
            beaconCore.rotation.set(Math.PI * 0.12, Math.PI * 0.2, 0);
            group.add(beaconCore);

            const orbitRingGeo = new THREE.TorusGeometry(d.rx * 22, d.rx * 1.2, 10, 38);
            const orbitRingMat = new THREE.MeshBasicMaterial({
                color: theme.accent,
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const orbitRing = new THREE.Mesh(orbitRingGeo, orbitRingMat);
            orbitRing.rotation.x = Math.PI / 2;
            orbitRing.position.y = 58;
            group.add(orbitRing);

            if (d.type === 'forest' || d.type === 'flower') {
                for (let t = 0; t < 7; t++) {
                    const trunkGeo = new THREE.CylinderGeometry(d.rx * 1.6, d.rx * 2.2, d.rx * 11, 6);
                    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 0.9, metalness: 0.0 });
                    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                    const angle = (t / 7) * Math.PI * 2 + Math.random() * 0.2;
                    trunk.position.set(Math.cos(angle) * d.rx * 44, 45, Math.sin(angle) * d.rx * 44);
                    group.add(trunk);

                    const treeGeo = new THREE.ConeGeometry(d.rx * (8 + Math.random() * 3), d.rx * (24 + Math.random() * 8), 7);
                    const treeMat = new THREE.MeshStandardMaterial({
                        color: d.type === 'flower' ? 0xe8a0c0 : 0x2d6e30,
                        roughness: 0.9,
                        metalness: 0
                    });
                    const tree = new THREE.Mesh(treeGeo, treeMat);
                    tree.position.set(trunk.position.x, 58, trunk.position.z);
                    group.add(tree);
                }
            } else if (d.type === 'crystal') {
                for (let c = 0; c < 8; c++) {
                    const crystalGeo = new THREE.OctahedronGeometry(d.rx * 8 + c * 3, 0);
                    const crystalMat = new THREE.MeshStandardMaterial({
                        color: 0x88ccff,
                        roughness: 0.2,
                        metalness: 0.6,
                        transparent: true,
                        opacity: 0.8
                    });
                    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
                    const angle = (c / 8) * Math.PI * 2;
                    crystal.position.set(Math.cos(angle) * d.rx * 34, 38 + c * 4.5, Math.sin(angle) * d.rx * 34);
                    crystal.rotation.set(Math.random(), Math.random(), Math.random());
                    group.add(crystal);
                }
            } else if (d.type === 'waterfall') {
                for (let wf = 0; wf < 2; wf++) {
                    const fallGeo = new THREE.PlaneGeometry(d.rx * 18, 86);
                    const fallMat = new THREE.MeshBasicMaterial({
                        color: 0x88ccff,
                        transparent: true,
                        opacity: 0.5,
                        side: THREE.DoubleSide
                    });
                    const fall = new THREE.Mesh(fallGeo, fallMat);
                    const sx = wf === 0 ? d.rx * 48 : -d.rx * 42;
                    const sz = wf === 0 ? d.rx * 12 : -d.rx * 8;
                    fall.position.set(sx, -16, sz);
                    fall.rotation.y = wf === 0 ? Math.PI * 0.14 : -Math.PI * 0.17;
                    group.add(fall);
                }
            } else if (d.type === 'fortress') {
                for (let tw = 0; tw < 4; tw++) {
                    const towerGeo = new THREE.CylinderGeometry(d.rx * 10, d.rx * 12, d.rx * 50, 8);
                    const towerMat = new THREE.MeshStandardMaterial({ color: 0x8a8a7a, roughness: 0.8, metalness: 0.1 });
                    const tower = new THREE.Mesh(towerGeo, towerMat);
                    const angle = (tw / 4) * Math.PI * 2;
                    tower.position.set(Math.cos(angle) * d.rx * 54, 44, Math.sin(angle) * d.rx * 54);
                    group.add(tower);
                }
                const wallGeo = new THREE.TorusGeometry(d.rx * 52, d.rx * 4.5, 8, 32);
                const wallMat = new THREE.MeshStandardMaterial({ color: 0x7f817c, roughness: 0.84, metalness: 0.1 });
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.rotation.x = Math.PI / 2;
                wall.position.y = 41;
                group.add(wall);
            } else if (d.type === 'wind') {
                for (let m = 0; m < 3; m++) {
                    const poleGeo = new THREE.CylinderGeometry(d.rx * 2.2, d.rx * 3.1, d.rx * 44, 6);
                    const poleMat = new THREE.MeshStandardMaterial({ color: 0xccccbb, roughness: 0.7, metalness: 0.2 });
                    const pole = new THREE.Mesh(poleGeo, poleMat);
                    const angle = (m / 3) * Math.PI * 2;
                    pole.position.set(Math.cos(angle) * d.rx * 24, 55, Math.sin(angle) * d.rx * 24);
                    group.add(pole);

                    const bladeGeo = new THREE.BoxGeometry(d.rx * 2.2, d.rx * 20, d.rx * 0.8);
                    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xeef8ff, roughness: 0.45, metalness: 0.3 });
                    const blade = new THREE.Mesh(bladeGeo, bladeMat);
                    blade.position.set(pole.position.x, 70, pole.position.z);
                    blade.rotation.z = angle;
                    group.add(blade);
                }
            } else if (d.type === 'star') {
                const starGeo = new THREE.OctahedronGeometry(d.rx * 12, 0);
                const starMat = new THREE.MeshStandardMaterial({ color: 0xffe083, emissive: 0xd8b747, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.55 });
                const star = new THREE.Mesh(starGeo, starMat);
                star.position.y = 76;
                group.add(star);
            } else if (d.type === 'aurora') {
                for (let a = 0; a < 3; a++) {
                    const arcGeo = new THREE.TorusGeometry(d.rx * (20 + a * 5), d.rx * 0.85, 8, 36, Math.PI * 1.35);
                    const arcMat = new THREE.MeshBasicMaterial({ color: 0x93ffe2, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
                    const arc = new THREE.Mesh(arcGeo, arcMat);
                    arc.rotation.set(Math.PI / 2 + a * 0.12, 0.5 + a * 0.22, 0.1 + a * 0.16);
                    arc.position.y = 54 + a * 7;
                    group.add(arc);
                }
            }

            group.position.set(d.x, d.y, d.z);
            group.userData.baseY = d.y;
            group.userData.name = d.name;
            group.userData.university = d.university || null;
            group.userData.landmark = d.landmark;
            group.userData.admissionUrl = d.admissionUrl || null;
            group.userData.admissionNote = d.admissionNote || null;
            group.userData.floatSpeed = 0.4 + Math.random() * 0.3;
            group.userData.floatPhase = Math.random() * Math.PI * 2;
            group.userData.rimRing = rimRing;
            group.userData.beaconCore = beaconCore;
            group.userData.orbitRing = orbitRing;
            this.scene.add(group);
            this.skyIslands.push(group);
        });
    },

    _seededRng(seed) {
        let s = seed >>> 0;
        return function rng() {
            s |= 0;
            s = s + 0x6D2B79F5 | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    initSeed(seed) {
        this.seededProps.forEach(m => this.scene.remove(m));
        this.seededProps = [];
        this.interactableProps.forEach(p => this.scene.remove(p.group));
        this.interactableProps = [];

        const rng = this._seededRng(seed);

        const CLOUD_SPREAD_X = WORLD_HALF * WORLD_SCALE * 0.85;
        const CLOUD_SPREAD_Z = WORLD_HALF * WORLD_SCALE * 0.85;
        const cloudTypes = ['normal', 'wispy', 'large', 'storm'];
        for (let i = 0; i < 60; i++) {
            const cx = (rng() - 0.5) * 2 * CLOUD_SPREAD_X;
            const cy = 400 + rng() * 600; // Height above ground (Y-up)
            const cz = (rng() - 0.5) * 2 * CLOUD_SPREAD_Z;
            const scale = 0.3 + rng() * 1.2;
            const type = cloudTypes[Math.floor(rng() * cloudTypes.length)];
            const cloud = type === 'wispy' ? this._makeWispyCloud(scale)
                : type === 'large' ? this._makeLargeCumulus(scale)
                    : type === 'storm' ? this._makeStormCloud(scale)
                        : this._makeCloud(scale);
            cloud.position.set(cx, cy, cz);
            cloud.userData.baseX = cx;
            cloud.userData.speed = 0.005 + rng() * 0.025;
            cloud.renderOrder = -10;
            cloud.visible = this.isLight;
            this.clouds.push(cloud);
            this.scene.add(cloud);
            this.seededProps.push(cloud);
        }

        const BUILDING_SPREAD = WORLD_HALF * WORLD_SCALE * 0.75;
        for (let i = 0; i < 60; i++) {
            const bx = (rng() - 0.5) * 2 * BUILDING_SPREAD;
            const bz = (rng() - 0.5) * 2 * BUILDING_SPREAD;
            const h = 110 + rng() * 340;
            const w = 26 + rng() * 56;
            const towerGroup = new THREE.Group();

            const palette = [
                new THREE.Color(0x2a3244),
                new THREE.Color(0x2f3d4f),
                new THREE.Color(0x38425a),
            ];
            const baseColor = palette[Math.floor(rng() * palette.length)].clone();

            const bodyType = Math.floor(rng() * 3);
            const bodyGeo = bodyType === 0
                ? new THREE.BoxGeometry(w, h, w * (0.74 + rng() * 0.18))
                : bodyType === 1
                    ? new THREE.CylinderGeometry(w * 0.55, w * 0.72, h, 8)
                    : new THREE.CylinderGeometry(w * 0.62, w * 0.62, h, 6);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.86,
                metalness: 0.2,
                transparent: true,
                opacity: 0.88,
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = h * 0.5;
            towerGroup.add(body);

            const crownGeo = new THREE.CylinderGeometry(w * 0.35, w * 0.5, h * 0.18, 10);
            const crownMat = new THREE.MeshStandardMaterial({
                color: baseColor.clone().offsetHSL(0.01, 0.04, 0.08),
                roughness: 0.62,
                metalness: 0.34,
                transparent: true,
                opacity: 0.9,
            });
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.y = h + h * 0.1;
            towerGroup.add(crown);

            const bandCount = 2 + Math.floor(rng() * 3);
            for (let b = 0; b < bandCount; b++) {
                const bandGeo = new THREE.TorusGeometry(w * (0.42 + b * 0.07), 1.1 + rng() * 1.6, 8, 28);
                const bandMat = new THREE.MeshBasicMaterial({
                    color: 0x8fd8ff,
                    transparent: true,
                    opacity: 0.22 + rng() * 0.2,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                const band = new THREE.Mesh(bandGeo, bandMat);
                band.rotation.x = Math.PI / 2;
                band.position.y = h * (0.28 + b * 0.18);
                towerGroup.add(band);
            }

            if (rng() > 0.45) {
                const antennaGeo = new THREE.CylinderGeometry(1.2, 1.8, 26 + rng() * 16, 6);
                const antennaMat = new THREE.MeshStandardMaterial({ color: 0x9aa4bc, roughness: 0.45, metalness: 0.7 });
                const antenna = new THREE.Mesh(antennaGeo, antennaMat);
                antenna.position.y = h + h * 0.21;
                towerGroup.add(antenna);

                const tipGeo = new THREE.SphereGeometry(2.6 + rng() * 1.8, 8, 8);
                const tipMat = new THREE.MeshBasicMaterial({ color: 0xa6ecff, transparent: true, opacity: 0.9 });
                const tip = new THREE.Mesh(tipGeo, tipMat);
                tip.position.y = antenna.position.y + 14;
                towerGroup.add(tip);
            }

            towerGroup.position.set(bx, 0, bz);
            towerGroup.userData.baseY = 0;
            towerGroup.userData.floatSpeed = 0.12 + rng() * 0.14;
            towerGroup.userData.floatPhase = rng() * Math.PI * 2;
            this.scene.add(towerGroup);
            this.seededProps.push(towerGroup);
        }

        const ROCK_SPREAD = WORLD_HALF * WORLD_SCALE * 0.7;
        for (let i = 0; i < 80; i++) {
            const rx = (rng() - 0.5) * 2 * ROCK_SPREAD;
            const ry = 50 + rng() * 400; // Float above ground
            const rz = (rng() - 0.5) * 2 * ROCK_SPREAD;
            const size = 10 + rng() * 40;
            const geo = new THREE.DodecahedronGeometry(size, 0);
            const shade = 0.3 + rng() * 0.3;
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(shade, shade * 0.9, shade * 0.8),
                roughness: 0.95,
                metalness: 0.05,
                transparent: true,
                opacity: 0.7,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(rx, ry, rz);
            mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            mesh.userData.baseY = ry;
            mesh.userData.floatSpeed = 0.2 + rng() * 0.4;
            mesh.userData.floatPhase = rng() * Math.PI * 2;
            this.scene.add(mesh);
            this.seededProps.push(mesh);
        }

        const CRYSTAL_SPREAD = WORLD_HALF * WORLD_SCALE * 0.6;
        for (let i = 0; i < 25; i++) {
            const group = new THREE.Group();
            const cx2 = (rng() - 0.5) * 2 * CRYSTAL_SPREAD;
            const cy2 = 100 + rng() * 350; // Floating height
            const cz2 = (rng() - 0.5) * 2 * CRYSTAL_SPREAD;
            const numCrystals = 3 + Math.floor(rng() * 4);
            const hue = rng();
            for (let j = 0; j < numCrystals; j++) {
                const crystalSize = 8 + rng() * 20;
                const geo = new THREE.OctahedronGeometry(crystalSize, 0);
                const color = new THREE.Color().setHSL(hue, 0.5 + rng() * 0.3, 0.5 + rng() * 0.2);
                const mat = new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.15,
                    metalness: 0.7,
                    transparent: true,
                    opacity: 0.75,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set((rng() - 0.5) * 40, rng() * 30, (rng() - 0.5) * 40);
                mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
                group.add(mesh);
            }
            group.position.set(cx2, cy2, cz2);
            group.userData.baseY = cy2;
            group.userData.floatSpeed = 0.15 + rng() * 0.25;
            group.userData.floatPhase = rng() * Math.PI * 2;
            this.scene.add(group);
            this.seededProps.push(group);
        }

        const PILLAR_SPREAD = WORLD_HALF * WORLD_SCALE * 0.65;
        for (let i = 0; i < 15; i++) {
            const px = (rng() - 0.5) * 2 * PILLAR_SPREAD;
            const pz = (rng() - 0.5) * 2 * PILLAR_SPREAD;
            const height = 200 + rng() * 400;
            const geo = new THREE.CylinderGeometry(3, 3, height, 6);
            const hue2 = rng();
            const color = new THREE.Color().setHSL(hue2, 0.6, 0.6);
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.25,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(px, height / 2, pz);
            this.scene.add(mesh);
            this.seededProps.push(mesh);
        }

        const ISLAND_SPREAD = WORLD_HALF * WORLD_SCALE * 0.65;
        const islandNames = [
            '별의 섬', '황금 섬', '구름 섬', '달빛 섬',
            '바람 섬', '불꽃 섬', '물결 섬', '숲의 섬',
            '얼음 섬', '번개 섬', '태양 섬', '은하 섬',
            '꿈의 섬', '미래 섬', '고대 섬', '환상 섬',
            '평화 섬', '용기 섬', '지혜 섬', '희망 섬',
        ];
        for (let i = 0; i < 20; i++) {
            const wx = (rng() - 0.5) * 2 * ISLAND_SPREAD;
            const wy = 150 + rng() * 350; // Float above ground
            const wz = (rng() - 0.5) * 2 * ISLAND_SPREAD;
            const rx = 1.0 + rng() * 1.5;
            const propId = `island_${seed}_${i}`;
            const name = islandNames[i % islandNames.length];
            const prop = new InteractableProp(propId, name, wx, wy, wz, rx, this.scene, (id, activated) => {
                if (this.onInteraction) this.onInteraction(id, activated);
            });
            prop.group.userData.floatSpeed = 0.3 + rng() * 0.4;
            prop.group.userData.floatPhase = rng() * Math.PI * 2;
            this.interactableProps.push(prop);
        }
    },

    setInteractionState(propId, activated) {
        const prop = this.interactableProps.find(p => p.id === propId);
        if (prop) prop.setActivated(activated);
    },

    _makeCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.6 });
        const blobs = [
            { x: 0, y: 0, s: 60 * scale },
            { x: 80, y: -15, s: 50 * scale },
            { x: -70, y: -10, s: 45 * scale },
            { x: 40, y: 30, s: 40 * scale },
            { x: -30, y: 25, s: 35 * scale },
        ];
        blobs.forEach(b => {
            const geo = new THREE.SphereGeometry(b.s, 10, 8);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },

    _makeWispyCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xf0f4ff, roughness: 1, metalness: 0, transparent: true, opacity: 0.4 });
        const blobs = [
            { x: 0, y: 0, s: 35 * scale },
            { x: 100, y: -5, s: 25 * scale },
            { x: -90, y: 5, s: 28 * scale },
            { x: 160, y: -8, s: 20 * scale },
            { x: -150, y: 3, s: 22 * scale },
            { x: 50, y: 10, s: 18 * scale },
            { x: -40, y: -8, s: 20 * scale },
        ];
        blobs.forEach(b => {
            const geo = new THREE.SphereGeometry(b.s, 8, 6);
            geo.scale(1.8, 0.5, 1.0);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },

    _makeLargeCumulus(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.7 });
        const blobs = [
            { x: 0, y: 0, s: 90 * scale },
            { x: 110, y: -20, s: 75 * scale },
            { x: -100, y: -15, s: 70 * scale },
            { x: 55, y: 50, s: 65 * scale },
            { x: -45, y: 45, s: 55 * scale },
            { x: 140, y: 10, s: 50 * scale },
            { x: -130, y: 5, s: 45 * scale },
            { x: 0, y: 65, s: 60 * scale },
        ];
        blobs.forEach(b => {
            const geo = new THREE.SphereGeometry(b.s, 12, 10);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },

    _makeStormCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 1, metalness: 0, transparent: true, opacity: 0.65 });
        const blobs = [
            { x: 0, y: 0, s: 80 * scale },
            { x: 120, y: -25, s: 70 * scale },
            { x: -110, y: -20, s: 65 * scale },
            { x: 50, y: 40, s: 60 * scale },
            { x: -60, y: 35, s: 55 * scale },
            { x: 0, y: -40, s: 75 * scale },
            { x: 80, y: -50, s: 50 * scale },
            { x: -70, y: -45, s: 55 * scale },
        ];
        blobs.forEach(b => {
            const geo = new THREE.SphereGeometry(b.s, 10, 8);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },
};
