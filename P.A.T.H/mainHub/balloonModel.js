import * as THREE from 'three';

// balloonSkins.js가 window.BALLOON_SKINS를 먼저 정의합니다.
export function getBalloonColors(skinId) {
    const skin = window.BALLOON_SKINS?.[skinId] || window.BALLOON_SKINS?.default;
    return skin?.colors || { primary: 0xcc1a1a, secondary: 0xffffff, accent: 0xffcc00 };
}

function getBalloonMaterial(skinId) {
    const skin = window.BALLOON_SKINS?.[skinId] || window.BALLOON_SKINS?.default;
    return skin?.material || { envelopeRoughness: 0.55, envelopeSheen: 0.15, seamRoughness: 0.70, accentMetalness: 0.10 };
}

export function setBalloonDetailLevel(balloonGroup, useLowDetail) {
    if (!balloonGroup?.userData) return;
    const lowGroup = balloonGroup.userData.lowDetailGroup;
    const detailedChildren = balloonGroup.userData.detailedChildren;
    if (!lowGroup || !Array.isArray(detailedChildren)) return;
    const nextDetail = useLowDetail ? 'low' : 'high';
    if (balloonGroup.userData.currentDetail === nextDetail) return;
    lowGroup.visible = useLowDetail;
    detailedChildren.forEach(c => { c.visible = !useLowDetail; });
    balloonGroup.userData.currentDetail = nextDetail;
}

// ── 재질 헬퍼 ──────────────────────────────────────────────

function envelopeMat(colors, mat) {
    return new THREE.MeshPhysicalMaterial({
        color:              colors.primary,
        roughness:          mat.envelopeRoughness,
        metalness:          0.02,
        clearcoat:          mat.clearcoat ?? 0,
        clearcoatRoughness: mat.clearcoatRoughness ?? 0.1,
        sheen:              mat.envelopeSheen,
        sheenColor:         new THREE.Color(colors.primary).lerp(new THREE.Color(0xffffff), 0.4),
        emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
        emissiveIntensity:  mat.emissiveIntensity ?? 0,
        side:               THREE.DoubleSide
    });
}

function seamMat(color, mat) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness:          mat.seamRoughness,
        metalness:          0.03,
        emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
        emissiveIntensity:  (mat.emissiveIntensity ?? 0) * 0.5
    });
}

function accentMat(colors, mat) {
    return new THREE.MeshPhysicalMaterial({
        color:              colors.accent,
        roughness:          0.4,
        metalness:          mat.accentMetalness,
        clearcoat:          (mat.clearcoat ?? 0) * 0.7,
        clearcoatRoughness: mat.clearcoatRoughness ?? 0.1,
        emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
        emissiveIntensity:  (mat.emissiveIntensity ?? 0) * 0.8
    });
}

function makeWickerPanel(width, height, depth, color) {
    return new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0.0 })
    );
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

// 고어(gore) 패널 색 결정: palette 있으면 순환, 없으면 primary/secondary 교대
function goreColor(colors, index) {
    if (colors.palette) {
        return colors.palette[index % colors.palette.length];
    }
    return index % 2 === 0 ? colors.primary : colors.secondary;
}

// ── 메인 3D 모델 ───────────────────────────────────────────

export function create3DBalloon(scale, colorScheme, isMe) {
    const group  = new THREE.Group();
    const colors = getBalloonColors(colorScheme);
    const mat    = getBalloonMaterial(colorScheme);

    const basketColor = colors.basket ?? 0x7a5528;
    const ropeColor   = colors.rope   ?? 0x4f3b24;

    const colorParts = { primary: [], secondary: [], accent: [] };

    // ── 기낭 (envelope) ─────────────────────────────────────
    const profile = [
        [0.0, -36.0], [6.5, -34.0], [20.0, -27.0],
        [32.0, -13.0], [37.0,  6.0], [34.0, 25.0],
        [24.0, 40.0],  [9.0,  49.0], [0.0,  52.0]
    ].map(([r, y]) => new THREE.Vector2(r * scale, y * scale));

    // palette가 있는 스킨은 고어마다 색이 다르므로 투명 기낭 위에 패널을 올림
    const envelopeIsTransparent = !!colors.palette;
    const envelopeColor = envelopeIsTransparent ? colors.primary : colors.primary;

    const envelopeMesh = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 40),
        envelopeMat(colors, mat)
    );
    envelopeMesh.position.y = scale * 22;
    colorParts.primary.push(envelopeMesh);
    group.add(envelopeMesh);

    // ── 고어 심(seam) + 패널 ────────────────────────────────
    const seamCount = 12;
    for (let i = 0; i < seamCount; i++) {
        const angle = (i / seamCount) * Math.PI * 2;
        const gc = goreColor(colors, i);

        // 고어 패널 (palette 스킨)
        if (colors.palette) {
            const panelProfile = profile.map(v => new THREE.Vector3(
                Math.cos(angle) * v.x,
                v.y + scale * 22,
                Math.sin(angle) * v.x
            ));
            const halfAngle = (Math.PI * 2) / seamCount / 2;
            const panelProfile2 = profile.map(v => new THREE.Vector3(
                Math.cos(angle + halfAngle) * v.x,
                v.y + scale * 22,
                Math.sin(angle + halfAngle) * v.x
            ));
            // 간단하게: 고어 색상 밴드로 표현
            const bandGeo = new THREE.CylinderGeometry(
                scale * 36, scale * 10, scale * 90, 1, 1, true,
                angle - 0.01, (Math.PI * 2) / seamCount + 0.02
            );
            const bandMat = new THREE.MeshStandardMaterial({
                color:             gc,
                roughness:         mat.envelopeRoughness + 0.05,
                metalness:         0.01,
                emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
                emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.6,
                side:              THREE.DoubleSide,
                transparent:       true,
                opacity:           0.92
            });
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.y = scale * 14;
            group.add(band);
        }

        // 심(seam) — 라인
        const seamPoints = profile.map(v => new THREE.Vector3(
            Math.cos(angle) * v.x,
            v.y + scale * 22,
            Math.sin(angle) * v.x
        ));
        const seamGeo = new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(seamPoints),
            12, scale * 0.55, 6, false
        );
        const sColor = colors.palette ? 0x888888 : colors.secondary;
        const seam = new THREE.Mesh(seamGeo, seamMat(sColor, mat));
        colorParts.secondary.push(seam);
        group.add(seam);

        // 수평 밴드 (palette 없는 스킨)
        if (!colors.palette && i % 2 === 0) {
            const bGeo = new THREE.CylinderGeometry(
                scale * 35.5, scale * 35.5, scale * 10, 24, 1, true
            );
            const bMat = new THREE.MeshStandardMaterial({
                color:       colors.secondary,
                roughness:   0.75,
                metalness:   0.02,
                transparent: true,
                opacity:     0.35,
                side:        THREE.DoubleSide
            });
            const b = new THREE.Mesh(bGeo, bMat);
            b.position.y = scale * (5 + i * 0.6);
            colorParts.secondary.push(b);
            group.add(b);
        }
    }

    // ── 크라운 vent ─────────────────────────────────────────
    const crown = new THREE.Mesh(
        new THREE.CircleGeometry(scale * 7.5, 24),
        accentMat(colors, mat)
    );
    crown.position.y = scale * 73.5;
    crown.rotation.x = Math.PI * 0.5;
    colorParts.accent.push(crown);
    group.add(crown);

    // ── 스커트 / 넥 ─────────────────────────────────────────
    const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 9.5, scale * 6.5, scale * 12, 20),
        accentMat(colors, mat)
    );
    skirt.position.y = scale * -14;
    colorParts.accent.push(skirt);
    group.add(skirt);

    // ── 로드 링 ─────────────────────────────────────────────
    const loadRing = new THREE.Mesh(
        new THREE.TorusGeometry(scale * 8.6, scale * 0.75, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x5f6368, roughness: 0.35, metalness: 0.7 })
    );
    loadRing.position.y = scale * -20;
    loadRing.rotation.x = Math.PI * 0.5;
    group.add(loadRing);

    // ── 바구니 ───────────────────────────────────────────────
    const basketGroup = new THREE.Group();
    basketGroup.position.y = scale * -56;

    const basketBase = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 18, scale * 2.8, scale * 18),
        new THREE.MeshStandardMaterial({ color: basketColor, roughness: 0.94, metalness: 0.0 })
    );
    basketBase.position.y = -scale * 7.6;
    basketGroup.add(basketBase);

    const wallH = scale * 13.5, wallD = scale * 1.6;
    [
        [scale * 17.5, wallH, wallD,   0, -scale * 0.6,  scale * 8.7],
        [scale * 17.5, wallH, wallD,   0, -scale * 0.6, -scale * 8.7],
        [wallD, wallH, scale * 17.5,  -scale * 8.7, -scale * 0.6, 0],
        [wallD, wallH, scale * 17.5,   scale * 8.7, -scale * 0.6, 0]
    ].forEach(([w, h, d, x, y, z]) => {
        const p = makeWickerPanel(w, h, d, basketColor === 0x7a5528 ? 0x8b632f : basketColor);
        p.position.set(x, y, z);
        basketGroup.add(p);
    });

    // 테두리 림
    const rimColor = new THREE.Color(basketColor);
    rimColor.multiplyScalar(0.6);
    const rimMat = new THREE.MeshStandardMaterial({
        color: rimColor,
        roughness: 0.86, metalness: 0.0
    });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(scale * 19.8, scale * 1.2, scale * 19.8), rimMat);
    rim.position.y = scale * 6.6;
    basketGroup.add(rim);

    // 서스펜션 포스트
    const postMat = new THREE.MeshStandardMaterial({ color: 0x73777d, roughness: 0.4, metalness: 0.7 });
    const postOffsets = [
        new THREE.Vector3( scale * 7.8, scale * 11.8,  scale * 7.8),
        new THREE.Vector3(-scale * 7.8, scale * 11.8,  scale * 7.8),
        new THREE.Vector3( scale * 7.8, scale * 11.8, -scale * 7.8),
        new THREE.Vector3(-scale * 7.8, scale * 11.8, -scale * 7.8)
    ];
    postOffsets.forEach(offset => {
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.7, scale * 0.7, scale * 10.5, 8),
            postMat
        );
        post.position.copy(offset);
        basketGroup.add(post);
    });

    // 버너
    const burnerFrame = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 8.5, scale * 1.2, scale * 8.5),
        new THREE.MeshStandardMaterial({ color: 0x646a73, roughness: 0.36, metalness: 0.72 })
    );
    burnerFrame.position.y = scale * 12.6;
    basketGroup.add(burnerFrame);

    const burner = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 1.8, scale * 2.4, scale * 5.5, 10),
        new THREE.MeshStandardMaterial({ color: 0x9ea3aa, roughness: 0.3, metalness: 0.82 })
    );
    burner.position.y = scale * 15.5;
    basketGroup.add(burner);

    group.add(basketGroup);

    // ── 서스펜션 케이블 ──────────────────────────────────────
    const cableMat = new THREE.MeshStandardMaterial({ color: ropeColor, roughness: 0.95, metalness: 0.0 });
    const cableGeo = new THREE.CylinderGeometry(scale * 0.3, scale * 0.3, 1, 6);
    const topAnchors = [
        new THREE.Vector3( scale * 6.4, scale * -20,  scale * 6.4),
        new THREE.Vector3(-scale * 6.4, scale * -20,  scale * 6.4),
        new THREE.Vector3( scale * 6.4, scale * -20, -scale * 6.4),
        new THREE.Vector3(-scale * 6.4, scale * -20, -scale * 6.4)
    ];
    const bottomAnchors = postOffsets.map(v =>
        new THREE.Vector3(v.x, basketGroup.position.y + scale * 11.8, v.z)
    );
    for (let i = 0; i < topAnchors.length; i++) {
        const cable = new THREE.Mesh(cableGeo, cableMat);
        placeCable(cable, topAnchors[i], bottomAnchors[i]);
        group.add(cable);
    }

    // ── 불꽃 (플레이어 본인 + phoenix 항상) ─────────────────
    if (isMe || colorScheme === 'phoenix') {
        const flameColor  = colorScheme === 'phoenix' ? 0xff4400 : 0xff7a1a;
        const iColor      = colorScheme === 'phoenix' ? 0xffaa00 : 0xffe08a;

        const flameOuter = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 2.2, scale * 11, 12),
            new THREE.MeshBasicMaterial({
                color: flameColor, transparent: true, opacity: 0.55,
                blending: THREE.AdditiveBlending, depthWrite: false
            })
        );
        const flameInner = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 1.15, scale * 8.8, 10),
            new THREE.MeshBasicMaterial({
                color: iColor, transparent: true, opacity: 0.70,
                blending: THREE.AdditiveBlending, depthWrite: false
            })
        );
        flameOuter.position.y = basketGroup.position.y + scale * 21;
        flameOuter.rotation.x = Math.PI;
        flameInner.position.y = basketGroup.position.y + scale * 20;
        flameInner.rotation.x = Math.PI;
        group.add(flameOuter);
        group.add(flameInner);
        group.userData.flame      = flameOuter;
        group.userData.innerFlame = flameInner;
    }

    // ── 저해상도 LOD ─────────────────────────────────────────
    const detailedChildren = group.children.slice();
    const lowDetailGroup   = new THREE.Group();

    const lowEnvelope = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 37, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.88),
        new THREE.MeshStandardMaterial({
            color:             colors.primary,
            roughness:         Math.min(0.92, mat.envelopeRoughness + 0.15),
            metalness:         0.01,
            emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
            emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.5
        })
    );
    lowEnvelope.position.y = scale * 23;
    colorParts.primary.push(lowEnvelope);
    lowDetailGroup.add(lowEnvelope);

    const lowBand = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 34.5, scale * 34.5, scale * 8, 12, 1, true),
        new THREE.MeshStandardMaterial({
            color: colors.palette ? colors.palette[2] : colors.secondary,
            roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.42,
            side: THREE.DoubleSide
        })
    );
    lowBand.position.y = scale * 7;
    colorParts.secondary.push(lowBand);
    lowDetailGroup.add(lowBand);

    const lowSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 9.2, scale * 6.8, scale * 10, 10),
        new THREE.MeshStandardMaterial({
            color:     colors.accent,
            roughness: 0.82,
            metalness: Math.max(0.02, mat.accentMetalness * 0.45)
        })
    );
    lowSkirt.position.y = scale * -14;
    colorParts.accent.push(lowSkirt);
    lowDetailGroup.add(lowSkirt);

    const lowBasket = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 16, scale * 12, scale * 16),
        new THREE.MeshStandardMaterial({ color: basketColor, roughness: 0.95, metalness: 0.0 })
    );
    lowBasket.position.y = scale * -56;
    lowDetailGroup.add(lowBasket);

    lowDetailGroup.visible = false;
    group.add(lowDetailGroup);

    group.userData.lowDetailGroup   = lowDetailGroup;
    group.userData.detailedChildren = detailedChildren;
    group.userData.currentDetail    = 'high';
    group.userData.colorParts       = colorParts;
    return group;
}

// ── 상점 미리보기용 간소화 모델 ─────────────────────────────

export function make3DBalloonPreview(scale, skinId) {
    const group  = new THREE.Group();
    const colors = getBalloonColors(skinId);
    const mat    = getBalloonMaterial(skinId);

    // 기낭
    const balloonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 40, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.75),
        new THREE.MeshPhysicalMaterial({
            color:              colors.primary,
            roughness:          mat.envelopeRoughness,
            metalness:          0.02,
            clearcoat:          mat.clearcoat ?? 0,
            clearcoatRoughness: mat.clearcoatRoughness ?? 0.1,
            emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
            emissiveIntensity:  mat.emissiveIntensity ?? 0,
            side:               THREE.DoubleSide
        })
    );
    balloonMesh.position.y = scale * 20;
    group.add(balloonMesh);

    // 세로 줄기 (palette → 각 줄마다 다른 색)
    const numStripes = 7;
    for (let i = 0; i < numStripes; i++) {
        const angle  = (i / numStripes) * Math.PI * 2;
        const sColor = colors.palette
            ? colors.palette[i % colors.palette.length]
            : (i % 2 === 0 ? colors.primary : colors.secondary);

        const stripe = new THREE.Mesh(
            new THREE.PlaneGeometry(scale * 10, scale * 62),
            new THREE.MeshStandardMaterial({
                color:             sColor,
                roughness:         mat.envelopeRoughness + 0.05,
                metalness:         0.01,
                emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
                emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.5,
                side:              THREE.DoubleSide,
                transparent:       true,
                opacity:           colors.palette ? 0.88 : 0.55
            })
        );
        stripe.position.set(
            Math.cos(angle) * scale * 34,
            scale * 18,
            Math.sin(angle) * scale * 34
        );
        stripe.lookAt(0, scale * 18, 0);
        group.add(stripe);
    }

    // 상단 캡
    const cap = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 8, 12, 8),
        new THREE.MeshPhysicalMaterial({
            color:             colors.accent,
            roughness:         0.3,
            metalness:         mat.accentMetalness,
            clearcoat:         mat.clearcoat ?? 0,
            emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
            emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.8
        })
    );
    cap.position.y = scale * 50;
    group.add(cap);

    // 바구니
    const basketColor = colors.basket ?? 0x8b6914;
    const previewBasket = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 20, scale * 15, scale * 20),
        new THREE.MeshStandardMaterial({ color: basketColor, roughness: 0.90, metalness: 0.0 })
    );
    previewBasket.position.y = scale * -25;
    group.add(previewBasket);

    // 로프
    const ropeColor = colors.rope ?? 0x654321;
    [
        [scale * 10,  scale * 10],
        [-scale * 10, scale * 10],
        [scale * 10,  -scale * 10],
        [-scale * 10, -scale * 10]
    ].forEach(([x, z]) => {
        const rope = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.5, scale * 0.5, scale * 35, 4),
            new THREE.MeshStandardMaterial({ color: ropeColor, roughness: 0.95, metalness: 0.0 })
        );
        rope.position.set(x, scale * -5, z);
        group.add(rope);
    });

    return group;
}
