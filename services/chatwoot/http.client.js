import axios from "axios";
import { config as configDotenv } from "dotenv";
configDotenv();

const _urlBase = process.env.CHATWOOT_URL_BASE?.replace(/\/+$/, "");
const _tokenApi = process.env.CHATWOOT_API_TOKEN;
export const accountId = process.env.CHATWOOT_ACCOUNT_ID ?? "1";
const DEBUG = /^1|true|yes$/i.test(process.env.CHATWOOT_HTTP_DEBUG || "");

if (!_urlBase) throw new Error("Env CHATWOOT_URL_BASE ausente");
if (!_tokenApi) throw new Error("Env CHATWOOT_API_TOKEN ausente");

// ---- helpers ----
const hasHeader = (headers, name) => {
    if (!headers) return false;
    const n = name.toLowerCase();
    return Object.keys(headers).some(k => k.toLowerCase() === n);
};

// Detecta FormData (browser/Node)
const isFormData = (v) =>
    (typeof FormData !== "undefined" && v instanceof FormData) ||
    (v && typeof v.getHeaders === "function");

// ---- axios instance ----
export const http = axios.create({
    baseURL: _urlBase,              // permite usar URLs relativas: "/api/v1/..."
    timeout: 15000,
    headers: {
        // NÃO fixe Content-Type aqui (deixe o axios decidir por JSON ou multipart)
        api_access_token: _tokenApi,  // header exigido pelo Chatwoot (Application API)
    },
    validateStatus: (s) => s >= 200 && s < 300,
});

// Request: aplica Content-Type JSON só quando necessário e não definido
http.interceptors.request.use((cfg) => {
    // log leve
    if (DEBUG) {
        console.log("[HTTP]", (cfg.method || "GET").toUpperCase(), cfg.url, {
            params: cfg.params,
            hasData: cfg.data !== undefined,
        });
    }

    // multipart → NUNCA force Content-Type (boundary é automático)
    if (isFormData(cfg.data)) {
        if (cfg.headers) {
            delete cfg.headers["Content-Type"];
            delete cfg.headers["content-type"];
        }
        return cfg;
    }

    // body simples → garanta JSON somente se ainda não foi definido
    if (cfg.data !== undefined && !hasHeader(cfg.headers, "Content-Type")) {
        cfg.headers = { ...(cfg.headers || {}), "Content-Type": "application/json" };
    }
    return cfg;
});

// Response: mensagem de erro útil
http.interceptors.response.use(
    (res) => res,
    (err) => {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const url = err?.config?.url;
        const method = err?.config?.method?.toUpperCase();
        const bodyStr = typeof data === "object" ? JSON.stringify(data) : String(data || err.message || "");
        const msg = `HTTP ${status ?? "ERR"} ${method || ""} ${url || ""} - ${bodyStr}`;

        if (DEBUG) console.error("[HTTP:ERR]", msg);

        // ✅ Preserva o erro original (mantém .response/.config)
        if (err && typeof err === "object") {
            err.message = msg;
            return Promise.reject(err);
        }

        const e = new Error(msg);
        if (err?.response) e.response = err.response;
        return Promise.reject(e);
    }
);

// ---- wrappers (retornam response.data) ----
export const getRaw = (url, config = {}) => http.get(url, config);
export const delRaw = (url, config = {}) => http.delete(url, config);
export const postRaw = (url, data, config = {}) => http.post(url, data, config);
export const putRaw = (url, data, config = {}) => http.put(url, data, config);
export const patchRaw = (url, data, config = {}) => http.patch(url, data, config);

export const get = (url, config = {}) => http.get(url, config).then(r => r.data);
export const del = (url, config = {}) => http.delete(url, config).then(r => r.data);
export const post = (url, data, config = {}) => http.post(url, data, config).then(r => r.data);
export const put = (url, data, config = {}) => http.put(url, data, config).then(r => r.data);
export const patch = (url, data, config = {}) => http.patch(url, data, config).then(r => r.data);

// Açúcar opcional (quando quiser forçar JSON explícito)
export const postJson = (url, data, config = {}) =>
    post(url, data, { ...config, headers: { ...(config.headers || {}), "Content-Type": "application/json" } });

// Açúcar para multipart (avatar etc.) — só passe um FormData válido
export const postMultipart = (url, formData, config = {}) =>
    post(url, formData, config);
