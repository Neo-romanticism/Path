'use strict';

const ROOM_SHOP = Object.freeze({
    wallpapers: Object.freeze([
        { key: 'default', name: '기본', price: 0, emoji: '⬜', gradients: ['#f8f9fa', '#e9ecef'], description: '깔끔한 기본 배경' },
        { key: 'blossom', name: '벚꽃', price: 500, emoji: '🌸', gradients: ['#fce4ec', '#f8bbd9'], description: '봄날 벚꽃이 흩날려요' },
        { key: 'night', name: '별밤', price: 800, emoji: '🌙', gradients: ['#0d1b4b', '#1a2a6c'], description: '별빛 가득한 밤하늘' },
        { key: 'dawn', name: '새벽', price: 1000, emoji: '🌅', gradients: ['#312060', '#5c3380'], description: '새벽의 신비로운 분위기' },
        { key: 'coral', name: '산호', price: 1200, emoji: '🪸', gradients: ['#fff3e0', '#ffe0b2'], description: '따뜻한 산호빛 감성' },
        { key: 'forest', name: '숲속', price: 1500, emoji: '🌿', gradients: ['#e8f5e9', '#c8e6c9'], description: '초록빛 숲 속의 고요함' },
        { key: 'library', name: '황금 도서관', price: 3000, emoji: '📖', gradients: ['#3e2723', '#4e342e'], description: '지식의 전당, 황금빛 서재' },
        { key: 'space', name: '우주', price: 5000, emoji: '🚀', gradients: ['#050510', '#0a0520'], description: '광활한 우주 속 나만의 공간' },
    ]),
    props: Object.freeze([
        { key: 'plant', name: '화분', emoji: '🌱', price: 200 },
        { key: 'coffee', name: '커피', emoji: '☕', price: 150 },
        { key: 'clock', name: '탁상시계', emoji: '⏰', price: 300 },
        { key: 'lamp', name: '스탠드', emoji: '💡', price: 250 },
        { key: 'trophy', name: '트로피', emoji: '🏆', price: 1000 },
        { key: 'pizza', name: '피자', emoji: '🍕', price: 100 },
        { key: 'cat', name: '고양이', emoji: '🐱', price: 500 },
        { key: 'books', name: '책더미', emoji: '📚', price: 200 },
        { key: 'ac', name: '에어컨', emoji: '❄️', price: 800 },
        { key: 'star', name: '별', emoji: '⭐', price: 300 },
        { key: 'music', name: '스피커', emoji: '🎵', price: 400 },
        { key: 'cookie', name: '쿠키', emoji: '🍪', price: 100 },
    ]),
});

function resolveRoomShopItem(itemKey) {
    for (const [category, items] of [['wallpaper', ROOM_SHOP.wallpapers], ['prop', ROOM_SHOP.props]]) {
        const item = items.find((entry) => entry.key === itemKey);
        if (item) {
            return { category, item };
        }
    }

    return null;
}

module.exports = {
    ROOM_SHOP,
    resolveRoomShopItem,
};