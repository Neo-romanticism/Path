/**
 * balloonSkins.js — 열기구 스킨 중앙 데이터 파일
 *
 * 새 스킨 추가: 이 파일에 항목 하나만 추가하면 끝.
 *
 * colors 필드:
 *   primary          – 기낭(envelope) 메인 색
 *   secondary        – 고어 심(seam) / 밴드 색
 *   accent           – 크라운·스커트·상단 캡 색
 *   palette          – (선택) 고어 패널별 개별 색 배열 (rainbow 등)
 *   basket           – (선택) 바구니 색 (기본 0x7a5528)
 *   rope             – (선택) 로프 색 (기본 0x4f3b24)
 *
 * material 필드:
 *   envelopeRoughness  – 기낭 거칠기 (0=광택, 1=무광)
 *   envelopeSheen      – 천 특유의 광택(sheen) 세기
 *   seamRoughness      – 심 거칠기
 *   accentMetalness    – 악센트 금속감
 *   clearcoat          – (선택) 유광 코팅 세기 (0~1)
 *   clearcoatRoughness – (선택) 코팅 거칠기 (기본 0.1)
 *   emissiveColor      – (선택) 발광 색 (16진수)
 *   emissiveIntensity  – (선택) 발광 세기 (0~3)
 *
 * hasOwnImage: true → assets/balloon_<id>.png 존재
 * hasOwnImage: false → 3D 전용 (폴백 시 default 이미지)
 */
window.BALLOON_SKINS = {

    // ────────────────────────────────────────────────────────
    // 기본 — 클래식 서커스 열기구
    // ────────────────────────────────────────────────────────
    default: {
        id: 'default',
        name: '기본 열기구',
        price: 0,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: true,
        colors: {
            primary:   0xcc1a1a,   // 짙은 빨강
            secondary: 0xffffff,   // 흰색 심 → 빨강·흰색 교대 줄무늬
            accent:    0xffcc00,   // 금빛 크라운
            basket:    0x7a5528,
            rope:      0x4f3b24
        },
        material: {
            envelopeRoughness:  0.55,
            envelopeSheen:      0.15,
            seamRoughness:      0.70,
            accentMetalness:    0.10
        }
    },

    // ────────────────────────────────────────────────────────
    // 무지개 — 고어 패널마다 다른 색
    // ────────────────────────────────────────────────────────
    rainbow: {
        id: 'rainbow',
        name: '무지개 열기구',
        price: 2000,
        darkImg: 'assets/balloon_rainbow.png',
        lightImg: 'assets/balloon_rainbow.png',
        hasOwnImage: true,
        colors: {
            primary:   0xff2200,
            secondary: 0xffffff,
            accent:    0xffffff,
            palette:   [
                0xff0000,  // 빨강
                0xff6600,  // 주황
                0xffdd00,  // 노랑
                0x00cc44,  // 초록
                0x0077ff,  // 파랑
                0x6600cc,  // 남색
                0xcc00ff   // 보라
            ],
            basket:    0x6b4f2a,
            rope:      0xffffff
        },
        material: {
            envelopeRoughness:  0.42,
            envelopeSheen:      0.30,
            seamRoughness:      0.55,
            accentMetalness:    0.05
        }
    },

    // ────────────────────────────────────────────────────────
    // 파스텔 — 부드럽고 몽환적인 톤
    // ────────────────────────────────────────────────────────
    pastel: {
        id: 'pastel',
        name: '파스텔 열기구',
        price: 3000,
        darkImg: 'assets/balloon_pastel.png',
        lightImg: 'assets/balloon_pastel.png',
        hasOwnImage: true,
        colors: {
            primary:   0xf4b8c8,   // 파스텔 핑크
            secondary: 0xb8dff5,   // 파스텔 블루
            accent:    0xfde8c0,   // 파스텔 피치
            palette:   [
                0xf4b8c8,  // 핑크
                0xb8dff5,  // 블루
                0xc8f0d8,  // 민트
                0xfde8c0,  // 피치
                0xe8c8f0,  // 라벤더
                0xf0f4b8,  // 레몬
                0xf4b8c8   // 핑크 반복
            ],
            basket:    0xd4a88a,
            rope:      0xf0d0e0
        },
        material: {
            envelopeRoughness:  0.70,
            envelopeSheen:      0.22,
            seamRoughness:      0.82,
            accentMetalness:    0.03,
            clearcoat:          0.10,
            clearcoatRoughness: 0.30
        }
    },

    // ────────────────────────────────────────────────────────
    // 레드 스트라이프 — 강렬한 빨강·흰색 줄무늬
    // ────────────────────────────────────────────────────────
    redstripes: {
        id: 'redstripes',
        name: '레드 스트라이프',
        price: 4000,
        darkImg: 'assets/balloon_redstripes.png',
        lightImg: 'assets/balloon_redstripes.png',
        hasOwnImage: true,
        colors: {
            primary:   0xbb0000,   // 짙은 빨강
            secondary: 0xffffff,   // 흰색
            accent:    0xaa0000,   // 어두운 빨강
            palette:   [
                0xbb0000,  // 빨강
                0xffffff,  // 흰색
                0xbb0000,
                0xffffff,
                0xbb0000,
                0xffffff,
                0xbb0000
            ],
            basket:    0x5a2020,
            rope:      0xdddddd
        },
        material: {
            envelopeRoughness:  0.50,
            envelopeSheen:      0.22,
            seamRoughness:      0.65,
            accentMetalness:    0.06
        }
    },

    // ────────────────────────────────────────────────────────
    // 황금 — 호화로운 금속 광택
    // ────────────────────────────────────────────────────────
    golden: {
        id: 'golden',
        name: '황금 열기구',
        price: 5000,
        darkImg: 'assets/balloon_golden.png',
        lightImg: 'assets/balloon_golden.png',
        hasOwnImage: false,
        colors: {
            primary:   0xffc200,   // 순금
            secondary: 0x9a6e00,   // 어두운 금
            accent:    0xffe566,   // 밝은 금
            basket:    0x4a2e00,
            rope:      0xb8860b
        },
        material: {
            envelopeRoughness:  0.28,
            envelopeSheen:      0.50,
            seamRoughness:      0.42,
            accentMetalness:    0.60,
            clearcoat:          0.55,
            clearcoatRoughness: 0.12
        }
    },

    // ────────────────────────────────────────────────────────
    // 우주 — 심우주 + 시안 발광
    // ────────────────────────────────────────────────────────
    cosmic: {
        id: 'cosmic',
        name: '우주 열기구',
        price: 6500,
        darkImg: 'assets/balloon_cosmic.png',
        lightImg: 'assets/balloon_cosmic.png',
        hasOwnImage: false,
        colors: {
            primary:   0x04080f,   // 거의 검정 (우주)
            secondary: 0x0a2050,   // 어두운 우주 파랑
            accent:    0x00d4ff,   // 전기 시안
            basket:    0x0a1a2e,
            rope:      0x00aacc
        },
        material: {
            envelopeRoughness:  0.20,
            envelopeSheen:      0.55,
            seamRoughness:      0.35,
            accentMetalness:    0.50,
            clearcoat:          0.40,
            clearcoatRoughness: 0.08,
            emissiveColor:      0x001a33,
            emissiveIntensity:  0.60
        }
    },

    // ────────────────────────────────────────────────────────
    // 석양 — 따뜻한 그라데이션 하늘
    // ────────────────────────────────────────────────────────
    sunset: {
        id: 'sunset',
        name: '석양 열기구',
        price: 8000,
        darkImg: 'assets/balloon_sunset.png',
        lightImg: 'assets/balloon_sunset.png',
        hasOwnImage: false,
        colors: {
            primary:   0xff3300,   // 타는 듯한 빨강
            secondary: 0xff8800,   // 주황
            accent:    0xffcc00,   // 황금 하늘
            palette:   [
                0xff1a00,  // 짙은 붉은 석양
                0xff5500,
                0xff8800,
                0xffaa00,
                0xffcc00,
                0xff8800,
                0xff5500
            ],
            basket:    0x3d1a00,
            rope:      0xcc6600
        },
        material: {
            envelopeRoughness:  0.45,
            envelopeSheen:      0.35,
            seamRoughness:      0.60,
            accentMetalness:    0.18,
            emissiveColor:      0x331100,
            emissiveIntensity:  0.25
        }
    },

    // ────────────────────────────────────────────────────────
    // 에메랄드 — 보석 같은 짙은 초록
    // ────────────────────────────────────────────────────────
    emerald: {
        id: 'emerald',
        name: '에메랄드 열기구',
        price: 9500,
        darkImg: 'assets/balloon_emerald.png',
        lightImg: 'assets/balloon_emerald.png',
        hasOwnImage: false,
        colors: {
            primary:   0x00803a,   // 짙은 에메랄드
            secondary: 0x004d22,   // 심록
            accent:    0x00ff88,   // 빛나는 에메랄드 하이라이트
            basket:    0x1a3d1a,
            rope:      0x006633
        },
        material: {
            envelopeRoughness:  0.38,
            envelopeSheen:      0.30,
            seamRoughness:      0.55,
            accentMetalness:    0.25,
            clearcoat:          0.45,
            clearcoatRoughness: 0.15,
            emissiveColor:      0x002a10,
            emissiveIntensity:  0.35
        }
    },

    // ────────────────────────────────────────────────────────
    // 불사조 — 불꽃 + 발광 효과
    // ────────────────────────────────────────────────────────
    phoenix: {
        id: 'phoenix',
        name: '불사조 열기구',
        price: 11000,
        darkImg: 'assets/balloon_phoenix.png',
        lightImg: 'assets/balloon_phoenix.png',
        hasOwnImage: false,
        colors: {
            primary:   0xdd2200,   // 불꽃 빨강
            secondary: 0xff6600,   // 불꽃 주황
            accent:    0xffdd00,   // 불꽃 노랑
            palette:   [
                0xff0000,
                0xff3300,
                0xff6600,
                0xff9900,
                0xffcc00,
                0xff6600,
                0xff3300
            ],
            basket:    0x2a0a00,
            rope:      0xff4400
        },
        material: {
            envelopeRoughness:  0.32,
            envelopeSheen:      0.48,
            seamRoughness:      0.50,
            accentMetalness:    0.20,
            emissiveColor:      0x441100,
            emissiveIntensity:  0.80
        }
    },

    // ────────────────────────────────────────────────────────
    // 은하수 — 보라·시안 성운 발광
    // ────────────────────────────────────────────────────────
    galaxy: {
        id: 'galaxy',
        name: '은하수 열기구',
        price: 13000,
        darkImg: 'assets/balloon_galaxy.png',
        lightImg: 'assets/balloon_galaxy.png',
        hasOwnImage: false,
        colors: {
            primary:   0x150030,   // 심우주 인디고
            secondary: 0x5500bb,   // 밝은 보라
            accent:    0x00ffcc,   // 형광 시안
            palette:   [
                0x220055,
                0x440099,
                0x6600cc,
                0x8800ff,
                0x00ccff,
                0x440099,
                0x220055
            ],
            basket:    0x0d0020,
            rope:      0x8800ff
        },
        material: {
            envelopeRoughness:  0.18,
            envelopeSheen:      0.60,
            seamRoughness:      0.30,
            accentMetalness:    0.55,
            clearcoat:          0.50,
            clearcoatRoughness: 0.06,
            emissiveColor:      0x1a0044,
            emissiveIntensity:  1.00
        }
    },

    // ────────────────────────────────────────────────────────
    // 다이아몬드 — 얼음 크리스탈, 극강 광택
    // ────────────────────────────────────────────────────────
    diamond: {
        id: 'diamond',
        name: '다이아몬드 열기구',
        price: 15000,
        darkImg: 'assets/balloon_diamond.png',
        lightImg: 'assets/balloon_diamond.png',
        hasOwnImage: false,
        colors: {
            primary:   0xd0efff,   // 얼음 흰색
            secondary: 0x88ccee,   // 연한 얼음 파랑
            accent:    0xffffff,   // 순백
            basket:    0x1a2a3a,
            rope:      0xaaddff
        },
        material: {
            envelopeRoughness:  0.10,
            envelopeSheen:      0.70,
            seamRoughness:      0.18,
            accentMetalness:    0.80,
            clearcoat:          0.95,
            clearcoatRoughness: 0.04,
            emissiveColor:      0x112233,
            emissiveIntensity:  0.20
        }
    }
};
