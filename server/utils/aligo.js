const axios = require('axios');
const crypto = require('crypto');

/**
 * 알리고 카카오톡 알림톡 API 연동
 * 
 * 환경변수 필요:
 * - ALIGO_API_KEY: 알리고 API 키
 * - ALIGO_USER_ID: 알리고 사용자 ID
 * - ALIGO_SENDER: 발신자 번호 (하이픈 제거)
 * - ALIGO_TEMPLATE_CODE: 승인받은 템플릿 코드
 * - ALIGO_PLUSFRIEND_ID: 카카오톡 채널 ID (@포함)
 */

const ALIGO_API_URL = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';
const ALIGO_TOKEN_URL = 'https://kakaoapi.aligo.in/akv10/token/create/';

class AligoService {
    constructor() {
        this.apiKey = process.env.ALIGO_API_KEY;
        this.userId = process.env.ALIGO_USER_ID;
        this.sender = process.env.ALIGO_SENDER;
        this.templateCode = process.env.ALIGO_TEMPLATE_CODE || 'TM_0001'; // 기본 템플릿
        this.plusFriendId = process.env.ALIGO_PLUSFRIEND_ID;
        this.token = null;
        this.tokenExpires = null;
    }

    /**
     * 알리고 토큰 발급 (옵션, API 키만으로도 가능)
     */
    async getToken() {
        if (this.token && this.tokenExpires && Date.now() < this.tokenExpires) {
            return this.token;
        }

        try {
            const response = await axios.post(ALIGO_TOKEN_URL, {
                apikey: this.apiKey,
                userid: this.userId
            });

            if (response.data.code === 0) {
                this.token = response.data.token;
                this.tokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24시간
                return this.token;
            }
            throw new Error(response.data.message || '토큰 발급 실패');
        } catch (error) {
            console.error('알리고 토큰 발급 오류:', error.message);
            throw error;
        }
    }

    /**
     * 인증번호 발송 (SMS)
     * @param {string} phone - 수신자 전화번호 (하이픈 제거)
     * @param {string} code - 6자리 인증번호
     * @returns {Promise<object>}
     */
    async sendVerificationCode(phone, code) {
        if (!this.apiKey || !this.userId || !this.sender) {
            throw new Error('알리고 API 설정이 필요합니다.');
        }

        // 운영 단순화를 위해 인증 발송은 SMS로 고정한다.
        return await this.sendSMS(phone, code);
    }

    /**
     * SMS 직접 발송 (폴백용)
     */
    async sendSMS(phone, code) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const message = `[P.A.T.H] 인증번호: ${code} (5분 유효)`;

        try {
            const response = await axios.post('https://apis.aligo.in/send/', null, {
                params: {
                    key: this.apiKey,
                    userid: this.userId,
                    sender: this.sender,
                    receiver: cleanPhone,
                    msg: message,
                    testmode_yn: process.env.ALIGO_TEST_MODE === 'true' ? 'Y' : 'N'
                }
            });

            if (response.data.result_code === '1') {
                return {
                    success: true,
                    type: 'sms',
                    message: 'SMS로 인증번호가 발송되었습니다.'
                };
            }
            throw new Error(response.data.message || 'SMS 발송 실패');
        } catch (error) {
            console.error('SMS 발송 오류:', error.message);
            throw error;
        }
    }

    /**
     * 인증번호 생성 (6자리)
     */
    generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * 전화번호 해시 생성 (보안용)
     */
    hashPhone(phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        return crypto.createHash('sha256').update(cleanPhone).digest('hex');
    }
}

module.exports = new AligoService();
