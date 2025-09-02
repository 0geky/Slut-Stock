const BASE_URL = 'https://api.joshlei.com/v2/growagarden/';
const JSTUDIO_KEY = 'js_53bab41c810e243e6c59aa012f8f5a7ff8fe168d116cb33dfc201cf90e24a019';

async function fetchApi(endpoint, params = '') {
    const url = BASE_URL + endpoint + params;
    const response = await fetch(url, {
        headers: {
            'jstudio-key': JSTUDIO_KEY
        }
    });
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return await response.json();
}

// Make fetchApi available globally without overwriting fetch
window.fetchApi = fetchApi;