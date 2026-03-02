let timeLeft = 0;
let originalTime = 0;
let timerInterval = null;
let isRunning = false;

const TimerEngine = {
    async start(hr, min) {
        timeLeft = (hr * 3600 + min * 60) * 100;
        originalTime = timeLeft;
        isRunning = true;

        const targetSec = Math.floor(originalTime / 100);
        fetch('/api/study/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ target_sec: targetSec })
        }).catch(() => {});

        if (typeof WakeLockManager !== 'undefined') WakeLockManager.request();

        UI.updateTimer(timeLeft);

        timerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                this.finish('SUCCESS');
            } else {
                timeLeft--;
                UI.updateTimer(timeLeft);
            }
        }, 10);

        console.log(`P.A.T.H: 공부 시작 (${hr}h ${min}m)`);
    },

    interrupt() {
        if (confirm("공부를 중단하시겠습니까?\n지금까지의 시간은 기록되나 골드 보상은 소멸됩니다.")) {
            this.finish('INTERRUPTED');
        }
    },

    async finish(type) {
        clearInterval(timerInterval);
        isRunning = false;
        if (typeof WakeLockManager !== 'undefined') WakeLockManager.release();

        const result = await StorageManager.completeStudy(type);

        if (result?.user) UI.updateAssets(result.user);
        UI.showResult(type, result?.earnedGold || 0);

        console.log(`P.A.T.H: 완료 [${type}] Gold: ${result?.earnedGold}`);
    }
};

document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRunning) {
        console.warn('P.A.T.H: 탈주 감지됨.');
        TimerEngine.finish('FAILED');
    }
});
