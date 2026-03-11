import * as THREE from 'three';

// A clickable world object (sky-island portal, building, etc.) that can be
// activated/deactivated and synced between players.
export class InteractableProp {
    /**
     * @param {string} id
     * @param {string} name
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} rx
     * @param {THREE.Scene} scene
     * @param {(id: string, activated: boolean) => void} onTrigger
     */
    constructor(id, name, x, y, z, rx, scene, onTrigger) {
        this.id = id;
        this.name = name;
        this.activated = false;
        this.onTrigger = onTrigger;

        this.group = new THREE.Group();
        this.group.userData.propId = id;
        this.group.userData.name = name;
        this.group.userData.baseY = y;
        this.group.userData.floatSpeed = 0.35;
        this.group.userData.floatPhase = 0;

        const topGeo = new THREE.CylinderGeometry(rx * 90, rx * 80, 30, 14);
        this._topMat = new THREE.MeshStandardMaterial({ color: 0x3a7d44, roughness: 0.9, metalness: 0 });
        const top = new THREE.Mesh(topGeo, this._topMat);
        top.position.y = 15;
        top.userData.propId = id;
        this.group.add(top);

        const botGeo = new THREE.CylinderGeometry(rx * 60, rx * 30, 80, 10);
        const botMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 1.0, metalness: 0 });
        const bot = new THREE.Mesh(botGeo, botMat);
        bot.position.y = -25;
        bot.userData.propId = id;
        this.group.add(bot);

        this._buildCastle(rx);

        const ringGeo = new THREE.TorusGeometry(rx * 85, 8, 8, 32);
        this._glowMat = new THREE.MeshBasicMaterial({
            color: 0xD4AF37,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        this._glowRing = new THREE.Mesh(ringGeo, this._glowMat);
        this._glowRing.rotation.x = Math.PI / 2;
        this._glowRing.position.y = 32;
        this.group.add(this._glowRing);

        const labelCanvas = this._makeLabel(name);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelGeo = new THREE.PlaneGeometry(160, 44);
        const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false });
        this._labelMesh = new THREE.Mesh(labelGeo, labelMat);
        this._labelMesh.position.y = 80;
        this.group.add(this._labelMesh);

        this.group.position.set(x, y, z);
        scene.add(this.group);
    }

    _buildCastle(rx) {
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x8b8b8b,
            roughness: 0.95,
            metalness: 0.05
        });

        const towerGeo = new THREE.CylinderGeometry(rx * 25, rx * 28, 70, 8);
        const tower = new THREE.Mesh(towerGeo, stoneMat);
        tower.position.set(0, 55, 0);
        this.group.add(tower);

        const roofGeo = new THREE.ConeGeometry(rx * 32, 35, 8);
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.9,
            metalness: 0
        });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 107, 0);
        this.group.add(roof);

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const bx = Math.cos(angle) * rx * 27;
            const bz = Math.sin(angle) * rx * 27;
            const battlementGeo = new THREE.BoxGeometry(rx * 8, 10, rx * 8);
            const battlement = new THREE.Mesh(battlementGeo, stoneMat);
            battlement.position.set(bx, 95, bz);
            this.group.add(battlement);
        }

        const towerPositions = [
            { x: rx * 50, z: rx * 50 },
            { x: -rx * 50, z: rx * 50 },
            { x: rx * 50, z: -rx * 50 },
            { x: -rx * 50, z: -rx * 50 }
        ];

        towerPositions.forEach(pos => {
            const sideTowerGeo = new THREE.CylinderGeometry(rx * 15, rx * 17, 50, 6);
            const sideTower = new THREE.Mesh(sideTowerGeo, stoneMat);
            sideTower.position.set(pos.x, 40, pos.z);
            this.group.add(sideTower);

            const sideRoofGeo = new THREE.ConeGeometry(rx * 20, 25, 6);
            const sideRoof = new THREE.Mesh(sideRoofGeo, roofMat);
            sideRoof.position.set(pos.x, 77, pos.z);
            this.group.add(sideRoof);
        });

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x7a7a7a,
            roughness: 0.95,
            metalness: 0.05
        });

        const wallGeoX = new THREE.BoxGeometry(rx * 100, 35, rx * 8);
        const frontWall = new THREE.Mesh(wallGeoX, wallMat);
        frontWall.position.set(0, 32.5, rx * 50);
        this.group.add(frontWall);

        const backWall = new THREE.Mesh(wallGeoX, wallMat);
        backWall.position.set(0, 32.5, -rx * 50);
        this.group.add(backWall);

        const wallGeoZ = new THREE.BoxGeometry(rx * 8, 35, rx * 100);
        const leftWall = new THREE.Mesh(wallGeoZ, wallMat);
        leftWall.position.set(-rx * 50, 32.5, 0);
        this.group.add(leftWall);

        const rightWall = new THREE.Mesh(wallGeoZ, wallMat);
        rightWall.position.set(rx * 50, 32.5, 0);
        this.group.add(rightWall);

        const gateGeo = new THREE.BoxGeometry(rx * 20, 25, rx * 10);
        const gateMat = new THREE.MeshStandardMaterial({
            color: 0x4a2f1a,
            roughness: 0.9,
            metalness: 0
        });
        const gate = new THREE.Mesh(gateGeo, gateMat);
        gate.position.set(0, 27.5, rx * 50);
        this.group.add(gate);

        const windowMat = new THREE.MeshBasicMaterial({ color: 0x4a4a1a });
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const wx = Math.cos(angle) * rx * 26;
            const wz = Math.sin(angle) * rx * 26;
            const windowGeo = new THREE.BoxGeometry(rx * 6, 8, 2);
            const window = new THREE.Mesh(windowGeo, windowMat);
            window.position.set(wx, 60, wz);
            window.lookAt(0, 60, 0);
            this.group.add(window);
        }

        const flagMat = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        const flagGeo = new THREE.PlaneGeometry(rx * 15, rx * 10);
        const mainFlag = new THREE.Mesh(flagGeo, flagMat);
        mainFlag.position.set(0, 125, 0);
        this.group.add(mainFlag);
    }

    _makeLabel(text) {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 88;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(10,12,24,0.82)';
        ctx.beginPath();
        ctx.roundRect(4, 4, 312, 80, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(49,130,246,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#3182F6';
        ctx.font = 'bold 26px "Pretendard Variable",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 160, 44);
        return c;
    }

    toggle() {
        this.setActivated(!this.activated);
        if (this.onTrigger) this.onTrigger(this.id, this.activated);
        this._showPropInfo();
    }

    setActivated(activated) {
        this.activated = !!activated;
        if (this.activated) {
            this._topMat.color.set(0xD4AF37);
            this._glowMat.opacity = 0.7;
        } else {
            this._topMat.color.set(0x3a7d44);
            this._glowMat.opacity = 0;
        }
    }

    update(t, camera) {
        const floatH = Math.sin(t * this.group.userData.floatSpeed + this.group.userData.floatPhase) * 14;
        this.group.position.y = this.group.userData.baseY + floatH;
        this.group.rotation.y += 0.0008;
        if (this._labelMesh) this._labelMesh.quaternion.copy(camera.quaternion);
        if (this.activated && this._glowMat) {
            this._glowMat.opacity = 0.4 + 0.35 * Math.sin(t * 3.5);
        }
    }

    _showPropInfo() {
        let el = document.getElementById('island-info');
        if (!el) {
            el = document.createElement('div');
            el.id = 'island-info';
            el.style.cssText = [
                'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);',
                'background:var(--surface-color,#1B2130);border:1.5px solid rgba(49,130,246,0.35);',
                'border-radius:20px;padding:28px 36px;z-index:1000;',
                "font-family:'Pretendard Variable',sans-serif;",
                'backdrop-filter:blur(24px);min-width:320px;text-align:center;',
                'box-shadow:0 8px 40px rgba(0,0,0,0.6);',
            ].join('');
            document.body.appendChild(el);
        }
        const statusText = this.activated ? '✨ 활성화됨 – 근처 모든 플레이어에게 실시간 반영됩니다' : '💤 비활성화됨';
        const statusColor = this.activated ? '#00C471' : 'var(--text-secondary,#7E94B8)';
        el.innerHTML = `
            <div style="font-size:32px;margin-bottom:12px;">🏝️</div>
            <div style="font-size:22px;color:var(--accent,#3182F6);font-weight:800;margin-bottom:8px;letter-spacing:-0.3px;">${this.name}</div>
            <div style="font-size:13px;color:${statusColor};margin-bottom:16px;">${statusText}</div>
            <div style="font-size:12px;color:var(--text-secondary,#7E94B8);line-height:1.65;margin-bottom:18px;">
                클릭으로 활성화하면 근처의 모든 플레이어에게 실시간으로 반영됩니다.
            </div>
            <button id="island-info-close" style="
                background:rgba(49,130,246,0.12);border:1.5px solid rgba(49,130,246,0.35);
                color:#3182F6;padding:10px 28px;border-radius:999px;
                font-size:13px;font-weight:700;cursor:pointer;
                font-family:'Pretendard Variable',sans-serif;">닫기</button>
        `;
        const closeBtn = el.querySelector('#island-info-close');
        if (closeBtn) {
            const remove = () => { if (el.parentElement) el.remove(); };
            closeBtn.addEventListener('click', remove);
            closeBtn.addEventListener('pointerup', (e) => {
                if (e.pointerType === 'touch') {
                    e.preventDefault();
                    remove();
                }
            }, { passive: false });
        }
        setTimeout(() => {
            if (el && el.parentElement) {
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.3s';
                setTimeout(() => { if (el.parentElement) el.remove(); }, 300);
            }
        }, 4500);
    }
}
