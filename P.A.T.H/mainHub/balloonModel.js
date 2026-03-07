import * as THREE from 'three';

export function getBalloonColors(colorScheme) {
    const schemes = {
        default: {
            primary: 0xff4444,
            secondary: 0xffaa44,
            accent: 0xffdd00
        },
        rainbow: {
            primary: 0xff00ff,
            secondary: 0x00ffff,
            accent: 0xffff00
        },
        pastel: {
            primary: 0xffb6c1,
            secondary: 0xb0e0e6,
            accent: 0xffd700
        },
        redstripes: {
            primary: 0xcc0000,
            secondary: 0xffffff,
            accent: 0xcc0000
        },
        golden: {
            primary: 0xffd700,
            secondary: 0xdaa520,
            accent: 0xffdf00
        },
        cosmic: {
            primary: 0x0d1b2a,
            secondary: 0x1b263b,
            accent: 0x415a77
        },
        sunset: {
            primary: 0xff6b35,
            secondary: 0xff9a56,
            accent: 0xffcc00
        },
        emerald: {
            primary: 0x2ecc71,
            secondary: 0x27ae60,
            accent: 0x1abc9c
        },
        phoenix: {
            primary: 0xff4500,
            secondary: 0xff8c00,
            accent: 0xffd700
        },
        galaxy: {
            primary: 0x6a0dad,
            secondary: 0x9932cc,
            accent: 0x00ced1
        },
        diamond: {
            primary: 0xe8f4f8,
            secondary: 0xb0e0e6,
            accent: 0xffffff
        }
    };
    return schemes[colorScheme] || schemes.default;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function placeCable(mesh, from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.0001) return;

    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
}

function makeWickerPanel(width, height, depth, color) {
    const panelGeo = new THREE.BoxGeometry(width, height, depth);
    const panelMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.96,
        metalness: 0.0
    });
    return new THREE.Mesh(panelGeo, panelMat);
}

function getBalloonMaterialProfile(colorScheme) {
    const profiles = {
        default: { envelopeRoughness: 0.52, envelopeSheen: 0.2, seamRoughness: 0.72, accentMetalness: 0.08 },
        rainbow: { envelopeRoughness: 0.38, envelopeSheen: 0.38, seamRoughness: 0.58, accentMetalness: 0.1 },
        pastel: { envelopeRoughness: 0.66, envelopeSheen: 0.18, seamRoughness: 0.8, accentMetalness: 0.06 },
        redstripes: { envelopeRoughness: 0.48, envelopeSheen: 0.26, seamRoughness: 0.68, accentMetalness: 0.08 },
        golden: { envelopeRoughness: 0.36, envelopeSheen: 0.45, seamRoughness: 0.56, accentMetalness: 0.25 },
        cosmic: { envelopeRoughness: 0.3, envelopeSheen: 0.5, seamRoughness: 0.5, accentMetalness: 0.3 },
        sunset: { envelopeRoughness: 0.42, envelopeSheen: 0.33, seamRoughness: 0.62, accentMetalness: 0.15 },
        emerald: { envelopeRoughness: 0.5, envelopeSheen: 0.26, seamRoughness: 0.7, accentMetalness: 0.1 },
        phoenix: { envelopeRoughness: 0.34, envelopeSheen: 0.46, seamRoughness: 0.56, accentMetalness: 0.22 },
        galaxy: { envelopeRoughness: 0.28, envelopeSheen: 0.52, seamRoughness: 0.48, accentMetalness: 0.28 },
        diamond: { envelopeRoughness: 0.22, envelopeSheen: 0.62, seamRoughness: 0.42, accentMetalness: 0.34 }
    };
    return profiles[colorScheme] || profiles.default;
}

export function setBalloonDetailLevel(balloonGroup, useLowDetail) {
    if (!balloonGroup?.userData) return;

    const lowGroup = balloonGroup.userData.lowDetailGroup;
    const detailedChildren = balloonGroup.userData.detailedChildren;
    if (!lowGroup || !Array.isArray(detailedChildren)) return;

    const nextDetail = useLowDetail ? 'low' : 'high';
    if (balloonGroup.userData.currentDetail === nextDetail) return;

    lowGroup.visible = useLowDetail;
    detailedChildren.forEach((child) => {
        child.visible = !useLowDetail;
    });
    balloonGroup.userData.currentDetail = nextDetail;
}

export function create3DBalloon(scale, colorScheme, isMe) {
    const group = new THREE.Group();
    const colors = getBalloonColors(colorScheme);
    const materialProfile = getBalloonMaterialProfile(colorScheme);

    const colorParts = {
        primary: [],
        secondary: [],
        accent: []
    };

    // Envelope profile approximates a real hot-air balloon silhouette.
    const profile = [
        [0.0, -36.0],
        [6.5, -34.0],
        [20.0, -27.0],
        [32.0, -13.0],
        [37.0, 6.0],
        [34.0, 25.0],
        [24.0, 40.0],
        [9.0, 49.0],
        [0.0, 52.0]
    ].map(([r, y]) => new THREE.Vector2(r * scale, y * scale));

    const envelopeGeo = new THREE.LatheGeometry(profile, 40);
    const envelopeMat = new THREE.MeshPhysicalMaterial({
        color: colors.primary,
        roughness: materialProfile.envelopeRoughness,
        metalness: 0.02,
        clearcoat: 0.08,
        sheen: materialProfile.envelopeSheen,
        side: THREE.DoubleSide
    });
    const envelope = new THREE.Mesh(envelopeGeo, envelopeMat);
    envelope.position.y = scale * 22;
    colorParts.primary.push(envelope);
    group.add(envelope);

    // Gore seams following the balloon envelope surface.
    const seamCount = 12;
    for (let i = 0; i < seamCount; i++) {
        const angle = (i / seamCount) * Math.PI * 2;

        const seamPoints = profile.map(v => new THREE.Vector3(
            Math.cos(angle) * v.x,
            v.y + scale * 22,
            Math.sin(angle) * v.x
        ));
        const seamCurve = new THREE.CatmullRomCurve3(seamPoints);
        const seamGeo = new THREE.TubeGeometry(seamCurve, 12, scale * 0.55, 6, false);
        const seamMat = new THREE.MeshStandardMaterial({
            color: colors.secondary,
            roughness: materialProfile.seamRoughness,
            metalness: 0.03
        });
        const seam = new THREE.Mesh(seamGeo, seamMat);
        colorParts.secondary.push(seam);
        group.add(seam);

        if (i % 2 === 0) {
            const bandGeo = new THREE.CylinderGeometry(scale * 35.5, scale * 35.5, scale * 10, 24, 1, true);
            const bandMat = new THREE.MeshStandardMaterial({
                color: colors.secondary,
                roughness: 0.75,
                metalness: 0.02,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide
            });
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.y = scale * (5 + i * 0.6);
            band.rotation.y = angle * 0.25;
            colorParts.secondary.push(band);
            group.add(band);
        }
    }

    // Crown vent patch at the top.
    const crownGeo = new THREE.CircleGeometry(scale * 7.5, 24);
    const crownMat = new THREE.MeshStandardMaterial({
        color: colors.accent,
        roughness: 0.6,
        metalness: materialProfile.accentMetalness,
        side: THREE.DoubleSide
    });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = scale * 73.5;
    crown.rotation.x = Math.PI * 0.5;
    colorParts.accent.push(crown);
    group.add(crown);

    // Skirt/neck section and load ring.
    const skirtGeo = new THREE.CylinderGeometry(scale * 9.5, scale * 6.5, scale * 12, 20);
    const skirtMat = new THREE.MeshStandardMaterial({
        color: colors.accent,
        roughness: 0.8,
        metalness: Math.max(0.03, materialProfile.accentMetalness * 0.6)
    });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.position.y = scale * -14;
    colorParts.accent.push(skirt);
    group.add(skirt);

    const loadRingGeo = new THREE.TorusGeometry(scale * 8.6, scale * 0.75, 8, 28);
    const loadRingMat = new THREE.MeshStandardMaterial({
        color: 0x5f6368,
        roughness: 0.35,
        metalness: 0.7
    });
    const loadRing = new THREE.Mesh(loadRingGeo, loadRingMat);
    loadRing.position.y = scale * -20;
    loadRing.rotation.x = Math.PI * 0.5;
    group.add(loadRing);

    // Basket base and wicker walls.
    const basketGroup = new THREE.Group();
    basketGroup.position.y = scale * -56;

    const basketBaseGeo = new THREE.BoxGeometry(scale * 18, scale * 2.8, scale * 18);
    const basketBaseMat = new THREE.MeshStandardMaterial({
        color: 0x7a5528,
        roughness: 0.94,
        metalness: 0.0
    });
    const basketBase = new THREE.Mesh(basketBaseGeo, basketBaseMat);
    basketBase.position.y = -scale * 7.6;
    basketGroup.add(basketBase);

    const wallHeight = scale * 13.5;
    const wallDepth = scale * 1.6;
    const wickerColor = 0x8b632f;

    const frontWall = makeWickerPanel(scale * 17.5, wallHeight, wallDepth, wickerColor);
    frontWall.position.set(0, -scale * 0.6, scale * 8.7);
    basketGroup.add(frontWall);

    const backWall = makeWickerPanel(scale * 17.5, wallHeight, wallDepth, wickerColor);
    backWall.position.set(0, -scale * 0.6, -scale * 8.7);
    basketGroup.add(backWall);

    const leftWall = makeWickerPanel(wallDepth, wallHeight, scale * 17.5, wickerColor);
    leftWall.position.set(-scale * 8.7, -scale * 0.6, 0);
    basketGroup.add(leftWall);

    const rightWall = makeWickerPanel(wallDepth, wallHeight, scale * 17.5, wickerColor);
    rightWall.position.set(scale * 8.7, -scale * 0.6, 0);
    basketGroup.add(rightWall);

    // Rim and suspension frame.
    const rimMat = new THREE.MeshStandardMaterial({
        color: 0x4a2f15,
        roughness: 0.86,
        metalness: 0.0
    });
    const rimTopGeo = new THREE.BoxGeometry(scale * 19.8, scale * 1.2, scale * 19.8);
    const rimTop = new THREE.Mesh(rimTopGeo, rimMat);
    rimTop.position.y = scale * 6.6;
    basketGroup.add(rimTop);

    const postMat = new THREE.MeshStandardMaterial({
        color: 0x73777d,
        roughness: 0.4,
        metalness: 0.7
    });

    const postOffsets = [
        new THREE.Vector3(scale * 7.8, scale * 11.8, scale * 7.8),
        new THREE.Vector3(-scale * 7.8, scale * 11.8, scale * 7.8),
        new THREE.Vector3(scale * 7.8, scale * 11.8, -scale * 7.8),
        new THREE.Vector3(-scale * 7.8, scale * 11.8, -scale * 7.8)
    ];

    postOffsets.forEach((offset) => {
        const postGeo = new THREE.CylinderGeometry(scale * 0.7, scale * 0.7, scale * 10.5, 8);
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.copy(offset);
        basketGroup.add(post);
    });

    // Burner frame and burner canister.
    const burnerFrameGeo = new THREE.BoxGeometry(scale * 8.5, scale * 1.2, scale * 8.5);
    const burnerFrameMat = new THREE.MeshStandardMaterial({
        color: 0x646a73,
        roughness: 0.36,
        metalness: 0.72
    });
    const burnerFrame = new THREE.Mesh(burnerFrameGeo, burnerFrameMat);
    burnerFrame.position.y = scale * 12.6;
    basketGroup.add(burnerFrame);

    const burnerGeo = new THREE.CylinderGeometry(scale * 1.8, scale * 2.4, scale * 5.5, 10);
    const burnerMat = new THREE.MeshStandardMaterial({
        color: 0x9ea3aa,
        roughness: 0.3,
        metalness: 0.82
    });
    const burner = new THREE.Mesh(burnerGeo, burnerMat);
    burner.position.y = scale * 15.5;
    basketGroup.add(burner);

    group.add(basketGroup);

    // Suspension cables from load ring to basket corners.
    const cableMat = new THREE.MeshStandardMaterial({
        color: 0x4f3b24,
        roughness: 0.95,
        metalness: 0.0
    });
    const cableGeo = new THREE.CylinderGeometry(scale * 0.3, scale * 0.3, 1, 6);

    const topAnchors = [
        new THREE.Vector3(scale * 6.4, scale * -20, scale * 6.4),
        new THREE.Vector3(-scale * 6.4, scale * -20, scale * 6.4),
        new THREE.Vector3(scale * 6.4, scale * -20, -scale * 6.4),
        new THREE.Vector3(-scale * 6.4, scale * -20, -scale * 6.4)
    ];

    const bottomAnchors = postOffsets.map((v) => new THREE.Vector3(v.x, basketGroup.position.y + scale * 11.8, v.z));

    for (let i = 0; i < topAnchors.length; i++) {
        const cable = new THREE.Mesh(cableGeo, cableMat);
        placeCable(cable, topAnchors[i], bottomAnchors[i]);
        group.add(cable);
    }

    // Burner flame effect (when player is active)
    if (isMe) {
        const flameOuterGeo = new THREE.ConeGeometry(scale * 2.2, scale * 11, 12);
        const flameOuterMat = new THREE.MeshBasicMaterial({
            color: 0xff7a1a,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const flameInnerGeo = new THREE.ConeGeometry(scale * 1.15, scale * 8.8, 10);
        const flameInnerMat = new THREE.MeshBasicMaterial({
            color: 0xffe08a,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const flameOuter = new THREE.Mesh(flameOuterGeo, flameOuterMat);
        flameOuter.position.y = basketGroup.position.y + scale * 21;
        flameOuter.rotation.x = Math.PI;

        const flameInner = new THREE.Mesh(flameInnerGeo, flameInnerMat);
        flameInner.position.y = basketGroup.position.y + scale * 20;
        flameInner.rotation.x = Math.PI;

        group.add(flameOuter);
        group.add(flameInner);
        group.userData.flame = flameOuter;
        group.userData.innerFlame = flameInner;
    }

    // Build a low-poly fallback model for distant balloons.
    const detailedChildren = group.children.slice();
    const lowDetailGroup = new THREE.Group();

    const lowEnvelopeGeo = new THREE.SphereGeometry(scale * 37, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.88);
    const lowEnvelopeMat = new THREE.MeshStandardMaterial({
        color: colors.primary,
        roughness: Math.min(0.92, materialProfile.envelopeRoughness + 0.15),
        metalness: 0.01
    });
    const lowEnvelope = new THREE.Mesh(lowEnvelopeGeo, lowEnvelopeMat);
    lowEnvelope.position.y = scale * 23;
    colorParts.primary.push(lowEnvelope);
    lowDetailGroup.add(lowEnvelope);

    const lowBandGeo = new THREE.CylinderGeometry(scale * 34.5, scale * 34.5, scale * 8, 12, 1, true);
    const lowBandMat = new THREE.MeshStandardMaterial({
        color: colors.secondary,
        roughness: 0.78,
        metalness: 0.02,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide
    });
    const lowBand = new THREE.Mesh(lowBandGeo, lowBandMat);
    lowBand.position.y = scale * 7;
    colorParts.secondary.push(lowBand);
    lowDetailGroup.add(lowBand);

    const lowSkirtGeo = new THREE.CylinderGeometry(scale * 9.2, scale * 6.8, scale * 10, 10);
    const lowSkirtMat = new THREE.MeshStandardMaterial({
        color: colors.accent,
        roughness: 0.82,
        metalness: Math.max(0.02, materialProfile.accentMetalness * 0.45)
    });
    const lowSkirt = new THREE.Mesh(lowSkirtGeo, lowSkirtMat);
    lowSkirt.position.y = scale * -14;
    colorParts.accent.push(lowSkirt);
    lowDetailGroup.add(lowSkirt);

    const lowBasketGeo = new THREE.BoxGeometry(scale * 16, scale * 12, scale * 16);
    const lowBasketMat = new THREE.MeshStandardMaterial({
        color: 0x7f592b,
        roughness: 0.95,
        metalness: 0.0
    });
    const lowBasket = new THREE.Mesh(lowBasketGeo, lowBasketMat);
    lowBasket.position.y = scale * -56;
    lowDetailGroup.add(lowBasket);

    lowDetailGroup.visible = false;
    group.add(lowDetailGroup);

    group.userData.lowDetailGroup = lowDetailGroup;
    group.userData.detailedChildren = detailedChildren;
    group.userData.currentDetail = 'high';

    group.userData.colorParts = colorParts;
    return group;
}
