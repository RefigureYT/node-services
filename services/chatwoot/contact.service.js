import * as crm from "./index.js";
import { parsePhoneNumber } from "libphonenumber-js/max";

// === Início dos HELPERS ===
const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

// Limpa profundo: remove "" | null | undefined; preserva 0/false; remove objetos vazios.
function cleanDeep(input) {
    if (Array.isArray(input)) {
        const arr = input.map((v) => cleanDeep(v)).filter((v) => v !== undefined);
        return arr.length ? arr : undefined;
    }
    if (isPlainObject(input)) {
        const out = {};
        for (const [k, v] of Object.entries(input)) {
            const cv = cleanDeep(v);
            if (cv !== undefined) out[k] = cv;
        }
        return Object.keys(out).length ? out : undefined;
    }
    if (input === "" || input === null || input === undefined) return undefined;
    return input;
}

// Extrai dígitos→E.164; aceita JID WhatsApp "5514...@s.whatsapp.net"
function toE164Phone(jidOrPhone) {
    const m = String(jidOrPhone || "").match(/^\d+/);
    return m ? `+${m[0]}` : undefined;
}

// Normaliza @handles/URLs para username puro
function normalizeHandle(val) {
    if (!val) return "";
    let h = String(val).trim().replace(/^@+/, "");
    try {
        if (/^https?:\/\//i.test(h)) {
            const u = new URL(h);
            const parts = u.pathname.split("/").filter(Boolean);
            if (parts.length) h = parts[parts.length - 1];
        }
    } catch { }
    return h.replace(/[/?#].*$/, "");
}

// Inferência BR/… sem depender de isValid()
function inferRegionFromPhone(e164Maybe) {
    const raw = String(e164Maybe || "").trim();
    const withPlus = raw.startsWith("+") ? raw : `+${raw}`;
    try {
        const p = parsePhoneNumber(withPlus);
        if (p?.country) return p.country; // usa mesmo se !isValid()
    } catch { }
    // Fallback por DDI
    const m = withPlus.match(/^\+?(\d{1,3})/);
    const ddi = m ? m[1] : null;
    const DDI_TO_ISO2 = {
        "55": "BR", "351": "PT", "54": "AR", "598": "UY",
        "1": null, "44": "GB", "33": "FR", "34": "ES", "39": "IT", "49": "DE"
    };
    return ddi ? (DDI_TO_ISO2[ddi] ?? null) : null;
}

function regionNameFromISO(iso2) {
    if (!iso2) return "";
    try {
        const dn = new Intl.DisplayNames(["en"], { type: "region" });
        return dn.of(iso2) || iso2;
    } catch { return iso2; }
}

// === Novo trecho completo ===
function normalizeAdditionalAttributes(aa, phoneE164) {
    const base = isPlainObject(aa) ? { ...aa } : {};

    // ---- Aliases para BIO dentro de additional_attributes ----
    // Se vierem chaves como bio/about/notes/descricao, mapeia para description
    const bioAliasesAA = ["bio", "description", "about", "notes", "descricao"];
    for (const k of bioAliasesAA) {
        if (typeof base[k] === "string" && base[k].trim()) {
            base.description = base.description || base[k];
        }
    }
    // Remove aliases redundantes (mantém apenas description)
    for (const k of ["bio", "about", "notes", "descricao"]) delete base[k];

    // ---- Aliases para socials dentro de additional_attributes ----
    // Aceita 'socials' como atalho; prioriza social_profiles
    if (isPlainObject(base.socials) && !isPlainObject(base.social_profiles)) {
        base.social_profiles = base.socials;
    }
    delete base.socials;

    // Normaliza social_profiles para usernames
    if (isPlainObject(base.social_profiles)) {
        base.social_profiles = {
            instagram: normalizeHandle(base.social_profiles.instagram),
            facebook: normalizeHandle(base.social_profiles.facebook),
            linkedin: normalizeHandle(base.social_profiles.linkedin),
            twitter: normalizeHandle(base.social_profiles.twitter),
            github: normalizeHandle(base.social_profiles.github),
        };
    }

    // País por phone se ausente
    if ((!base.country_code || !String(base.country_code).trim()) && phoneE164) {
        const iso = inferRegionFromPhone(phoneE164);
        if (iso) {
            base.country_code = iso;
            if (!base.country || !String(base.country).trim()) {
                base.country = regionNameFromISO(iso);
            }
        }
    }

    return cleanDeep(base);
}
// === Fim dos HELPERS ===

export function ping() {
    console.log('Account ID ->', crm.http.accountId);
    return 'pong';
}

export async function getContacts() {
    const url = `/api/v1/accounts/${crm.http.accountId}/contacts/`;
    const response = await crm.http.get(url);
    return response;
}

export async function searchContacts(query) {
    const url = `/api/v1/accounts/${crm.http.accountId}/contacts/search`;
    const response = await crm.http.get(url, { params: { q: query } });
    return response;
}

/**
 * Cria um contato no Chatwoot (Application API).
 * 
 * 🔎 Regras importantes
 * - Cidade/País devem ir em `additional_attributes` (ex.: { city, country, country_code }).
 * - `custom_attributes` SOMENTE pode conter chaves já criadas no painel (Settings → Custom Attributes).
 * - Se você enviar chaves não definidas em `custom_attributes`, o Chatwoot pode retornar 400/422.
 * - `phone_number` é extraído do `identifier` (JID/WhatsApp) no formato E.164 (+5514...).
 * 
 * @param {number} inboxId                       ID da inbox (ex.: WhatsApp)
 * @param {string} name                          Nome do contato (opcional)
 * @param {string} identifier                    Ex.: "5514999999999@s.whatsapp.net" (pode ser só número também)
 * @param {string|null} [avatar_url=null]        URL do avatar (opcional)
 * @param {string} [city=""]                     Cidade (vai para additional_attributes.city)
 * @param {object} [opts]                        Opções extras
 * @param {string} [opts.email]                  Email do contato
 * @param {string} [opts.country]                País (nome, ex.: "Brazil") — será salvo em additional_attributes.country
 * @param {string} [opts.country_code]           Código ISO-3166-1 alpha-2 (ex.: "BR") — additional_attributes.country_code
 * @param {string} [opts.bio]                    Biografia (UI lê de additional_attributes.description)
 * @param {string} [opts.company_name]           Empresa (additional_attributes.company_name)
 * @param {object} [opts.socials]                Redes sociais (use apenas o username; sem "@", URL também é aceita)
 * @param {string} [opts.socials.instagram]
 * @param {string} [opts.socials.facebook]
 * @param {string} [opts.socials.linkedin]
 * @param {string} [opts.socials.twitter]
 * @param {string} [opts.socials.github]
 * @param {object} [opts.custom]                 (Opcional) Objeto de custom attributes JÁ DEFINIDOS no painel
 * 
 * @returns {Promise<any>}                       Resposta do Chatwoot (contato criado)
 * 
 * @example
 * const contato = await services.chatwoot.contact.createContact(
 *   1,
 *   "Contato para teste 23",
 *   "5514996748623@s.whatsapp.net", // Precisa ser um número válido, se não a busca por country falha
 *   "https://robohash.org/e323369c9440eb6b7ecdcb83585c78e7?set=set4&bgset=&size=400x400", // ou pode ser null para não enviar o avatar_url
 *   undefined, // "Jaú", // Cidade
 *   {
 *       email: "contato2392277@jaupesca.com.br",
 *       country: "Brazil", // Não precisa enviar porque o código identifica automaticamente por meio do DDI
 *       country_code: "BR",
 *       socials: { 
 *           instagram: "https://instagram.com/jaupesca", // Pode ser tanto URL
 *           facebook: "https://web.facebook.com/jaupesca.oficial",
 *           linkedin: "jaupesca", // Como também só o username
 *           twitter: "jaupesca_oficial", // A função vai normalizar
 *           github: "jaupesca"
 *       },
 *       bio: "Este é um contato de teste criado via API.", // Não é obrigatório
 *       company_name: "Empresa Exemplo Ltda", // Não é obrigatório
 *       custom: { // Só se você tiver adicionado custom attributes no painel (Configurações -> Atributos Personalizados)
 *           favorite_color: "blue",
 *           customer_since: "2023-01-15"
 *       }
 *   }
 * ); 
 */
export async function createContact(
    inboxId,
    name,
    identifier,
    avatar_url = null,
    city = "",
    {
        email = "",
        country = "",
        country_code = "",
        bio = "",
        company_name = "",
        socials = {},
        custom, // use somente se as chaves existem no painel
    } = {}
) {
    // Endpoint oficial (Application API)
    const url = `/api/v1/accounts/${crm.http.accountId}/contacts`;

    /**
     * Extrai um número E.164 dos dígitos do JID/phone (ex.: "5514...@s.whatsapp.net" -> "+5514...")
     * - Se não houver dígitos, retorna undefined para não enviar phone_number.
     */
    const toE164 = (jidOrPhone) => {
        const m = String(jidOrPhone || "").match(/^\d+/);
        return m ? `+${m[0]}` : undefined;
    };

    /**
     * Remove somente valores "vazios" ("" | null | undefined) — preserva 0, false, objetos e arrays.
     * - Útil para montar payloads sem campos nulos.
     */
    const clean = (obj) =>
        JSON.parse(
            JSON.stringify(obj, (_k, v) =>
                v === "" || v === null || v === undefined ? undefined : v
            )
        );

    /**
    * Inferir o ISO2 do país (ex.: "BR", "US", "CA") a partir de um E.164.
    * Ignora números não geográficos (toll-free etc).
    */
    function inferRegionFromPhone(e164) {
        try {
            const p = parsePhoneNumber(e164);
            if (!p || !p.isValid?.()) return null;
            const t = p.getType?.();
            if (t && ["TOLL_FREE", "PREMIUM_RATE", "SHARED_COST", "VOIP", "PERSONAL_NUMBER", "UAN", "PAGER"].includes(String(t))) {
                return null;
            }
            return p.country || null;
        } catch {
            return null;
        }
    }

    /** Nome do país em INGLÊS (Chatwoot espera "Brazil", "United States" etc.) */
    function regionNameFromISO(iso2) {
        if (!iso2) return "";
        try {
            const dn = new Intl.DisplayNames(["en"], { type: "region" });
            return dn.of(iso2) || iso2;
        } catch {
            return iso2;
        }
    }

    /**
    * Normaliza um username de rede social:
    * - remove "@" do início
    * - se for URL, extrai o último segmento do path
    * - remove sufixos como "/" ou querystring/fragment
    */
    function normalizeHandle(val) {
        if (!val) return "";
        let h = String(val).trim().replace(/^@+/, "");
        try {
            if (/^https?:\/\//i.test(h)) {
                const u = new URL(h);
                const parts = u.pathname.split("/").filter(Boolean);
                if (parts.length) h = parts[parts.length - 1];
            }
        } catch { }
        return h.replace(/[/?#].*$/, "");
    }

    // Normaliza o telefone (se vier um JID do WhatsApp, pegamos os dígitos).
    const phoneE164 = toE164(identifier);

    // Regra mínima: precisa ter pelo menos um entre identifier/email/phone_number
    if (!identifier && !email && !phoneE164) {
        throw new Error(
            "createContact: informe pelo menos identifier, email ou phone_number"
        );
    }

    // === Auto-país: se não veio country_code/country, tenta inferir pelo número E.164 ===
    let _country_code = country_code;
    let _country = country;

    if ((!_country_code || !_country_code.trim()) && phoneE164) {
        const iso = inferRegionFromPhone(phoneE164);
        if (iso) {
            _country_code = iso;                   // ex.: "BR"
            if (!_country || !_country.trim()) {
                _country = regionNameFromISO(iso);   // ex.: "Brazil"
            }
        }
    }
    // Agora use _country/_country_code no additional_attributes (em vez das variáveis originais)

    /**
     * additional_attributes
     * - É onde o Chatwoot espera dados livres/estruturados do contato, como localização.
     * - Campos comuns: city, country (nome), country_code (ISO-2).
     * - Aqui também colocamos bio/company_name e os sociais normalizados.
     */
    // Redes sociais devem ir em additional_attributes.social_profiles
    const social_profiles = clean({
        instagram: normalizeHandle(socials.instagram),
        facebook: normalizeHandle(socials.facebook),
        linkedin: normalizeHandle(socials.linkedin),
        twitter: normalizeHandle(socials.twitter),
        github: normalizeHandle(socials.github),
    });

    const additional_attributes = clean({
        city,
        country: _country,
        country_code: _country_code,
        description: bio,              // campo de biografia na UI
        company_name,
        social_profiles: Object.keys(social_profiles).length ? social_profiles : undefined,
    });

    /**
     * custom_attributes (opcional):
     * - Só envie se você tiver CERTEZA que as chaves existem em Settings → Custom Attributes.
     * - Exemplo: { vip: true, tier: "gold" } — mas somente se "vip" e "tier" foram definidos no painel.
     */
    const custom_attributes =
        custom && typeof custom === "object" && Object.keys(custom).length
            ? custom
            : undefined;

    // Monta o payload final eliminando os campos vazios
    const payload = clean({
        inbox_id: inboxId,
        name,
        email,
        identifier,
        phone_number: phoneE164,
        avatar_url,
        additional_attributes:
            Object.keys(additional_attributes).length ? additional_attributes : undefined,
        custom_attributes, // só vai se tiver sido fornecido (e não-vazio)
    });

    // Envia a requisição usando o cliente HTTP já configurado (token/baseURL/tratamento).
    try {
        const res = await crm.http.post(url, payload);

        // --- Autofix: se a resposta não trouxe country/country_code mas nós inferimos, faz PATCH ---
        try {
            const created = res?.payload?.contact;
            const savedAA = created?.additional_attributes || {};
            // === Novo trecho completo ===
            const needPatch =
                !!(_country || _country_code) &&
                // Faça PATCH se QUALQUER um estiver faltando (principalmente o country_code)
                (!savedAA?.country_code || !savedAA?.country);

            // === Novo trecho completo ===
            if (created?.id) {
                const aaPatch = clean({
                    ...savedAA,
                    country_code: _country_code || savedAA.country_code,
                    country: _country || savedAA.country,
                });

                if (JSON.stringify(aaPatch) !== JSON.stringify(savedAA)) {
                    await crm.http.patch(
                        `/api/v1/accounts/${crm.http.accountId}/contacts/${created.id}`,
                        { additional_attributes: aaPatch }
                    );
                }

                const fixed = await crm.http.get(
                    `/api/v1/accounts/${crm.http.accountId}/contacts/${created.id}`
                );
                return fixed;
            }
        } catch (e) {
            console.warn("Auto-fix country failed:", e?.response?.data || e?.message);
        }

        return res;
    } catch (err) {
        // Log detalhado para diagnosticar erros 400/422 de schema/validação
        const status = err?.response?.status;
        const data = err?.response?.data;
        console.error(
            "Chatwoot createContact error:",
            status,
            data || err?.message || err
        );
        throw err;
    }
}

/** 
 * Atualiza um contato existente no Chatwoot (Application API).
 * 
 * ✨ Objetivo: aceitar um "patch" **organizado** no mesmo formato do create,
 * mas sendo flexível com aliases. Sempre priorize enviar TUDO no formato certo.
 *
 * CAMADAS SUPORTADAS:
 * - Top-level:    name, email, identifier, phone_number, avatar_url,
 *                 additional_attributes, custom_attributes
 * - Conveniências no topo (serão movidas p/ additional_attributes):
 *                 city, company_name, socials, social_profiles,
 *                 bio | description | about | notes | descricao,
 *                 country, country_code
 *
 * REGRAS:
 * - `bio/description/...` sempre mapeado para `additional_attributes.description`.
 * - `socials` (topo ou AA) é alias de `social_profiles` (usernames normalizados).
 * - `phone_number` é inferido de `identifier` (JID/WhatsApp) se ausente.
 * - `country_code/country` dentro de AA são preservados; se ausentes e houver telefone,
 *    tenta-se inferir pelo DDI (sem depender de `isValid()`).
 * - Merge por padrão: AA/CA recebidos são **mesclados** com o salvo.
 *   Use `{ mergeAdditional: false }` para REPLACE de AA e `{ mergeCustom: false }` para CA.
 *
 * EXEMPLOS (todos válidos):
 * @example Patch completo e organizado (recomendado)
 * ```js
 * await updateContact(21, {
 *   name: "Contato teste",
 *   email: "kelvinho@jaupesca.com",
 *   phone_number: "+5514996663321",
 *   additional_attributes: {
 *     city: "Jaú",
 *     country_code: "BR",
 *     country: "Brazil",
 *     company_name: "Jaú Pesca",
 *     description: "Bio atualizada via API",
 *     social_profiles: { instagram: "jaupesca", github: "jaupesca" }
 *   },
 *   custom_attributes: { favorite_color: "blue" }
 * });
 * ```
 *
 * @example Conveniências no topo (auto-mapeadas para additional_attributes)
 * ```js
 * await updateContact(21, {
 *   city: "Jaú-SP",
 *   bio: "Nova bio",
 *   socials: { instagram: "https://instagram.com/jaupesca" }
 * });
 * ```
 *
 * @example Patch mínimo apenas de additional_attributes
 * ```js
 * await updateContact(21, {
 *   additional_attributes: { city: "Jaú", country_code: "BR" }
 * });
 * ```
 *
 * @example Replace total de additional_attributes (sem merge)
 * ```js
 * await updateContact(21, {
 *   additional_attributes: { city: "Jaú" }
 * }, { mergeAdditional: false });
 * ```
 * @param {number|string} contactId                       ID do contato
 * @param {object} patch                                   Objeto de atualização (ver acima)
 * @param {object} [options]
 * @param {boolean} [options.mergeAdditional=true]         Mesclar additional_attributes
 * @param {boolean} [options.mergeCustom=true]             Mesclar custom_attributes
 * @returns {Promise<any>}                                 Contato atualizado (GET após PATCH)
 */
export async function updateContact(
    contactId,
    patch,
    { mergeAdditional = true, mergeCustom = true } = {}
) {
    if (!contactId) throw new Error("updateContact: contactId obrigatório");
    const url = `/api/v1/accounts/${crm.http.accountId}/contacts/${contactId}`;

    // 1) Coagir patch a objeto limpo
    const raw = isPlainObject(patch) ? { ...patch } : {};
    const allowedTop = [
        "name",
        "email",
        "identifier",
        "phone_number",
        "avatar_url",
        "additional_attributes",
        "custom_attributes",
        // conveniências que serão reencaminhadas para AA
        "city",
        "company_name",
        "socials",
        "social_profiles",
        // aliases de bio aceitos no topo
        "bio",
        "description",
        "about",
        "notes",
        "descricao",
        // conveniências de país aceitas no topo
        "country",
        "country_code",
    ];
    const top = {};
    for (const k of allowedTop) {
        if (k in raw) top[k] = raw[k];
    }

    // === Novo trecho completo ===
    {
        const aaFromTop = isPlainObject(top.additional_attributes) ? top.additional_attributes : {};

        // BIO no topo (aliases) → description
        const bioAliasesTop = ["bio", "description", "about", "notes", "descricao"];
        const bioFromTop = bioAliasesTop
            .map(k => top[k])
            .find(v => typeof v === "string" && v.trim());

        // socials no topo → social_profiles
        const socialsTop =
            (isPlainObject(top.social_profiles) && top.social_profiles) ||
            (isPlainObject(top.socials) && top.socials) ||
            undefined;

        const aaMerged = {
            ...aaFromTop,
            // campos diretos
            ...("city" in top ? { city: top.city } : {}),
            ...("company_name" in top ? { company_name: top.company_name } : {}),
            // país (se informados no topo)
            ...("country_code" in top ? { country_code: top.country_code } : {}),
            ...("country" in top ? { country: top.country } : {}),
            // bio aliases → description
            ...(bioFromTop ? { description: bioFromTop } : {}),
            // socials → social_profiles
            ...(socialsTop ? { social_profiles: socialsTop } : {}),
        };

        if (Object.keys(aaMerged).length) {
            top.additional_attributes = aaMerged;

            // Limpa do topo para não vazar para o payload
            delete top.city;
            delete top.company_name;
            for (const k of bioAliasesTop) delete top[k];
            delete top.socials;
            delete top.social_profiles;
            delete top.country;
            delete top.country_code;
        }
    }

    // 2) Preencher phone_number a partir do identifier (se faltar)
    let phoneE164 = top.phone_number || toE164Phone(top.identifier);
    if (phoneE164) top.phone_number = phoneE164;

    // 3) Normalizar additional_attributes (inclui social_profiles e país)
    if ("additional_attributes" in top) {
        top.additional_attributes = normalizeAdditionalAttributes(
            top.additional_attributes,
            phoneE164
        );
    }

    // 4) Se vamos mesclar, carregar o atual para não perder chaves
    let current = null;
    if (mergeAdditional || mergeCustom) {
        const got = await crm.http.get(url);
        current = got?.payload?.contact || {};
    }

    // 5) Montar payload final com merge controlado
    const currentAA = isPlainObject(current?.additional_attributes)
        ? current.additional_attributes
        : {};
    const currentCA = isPlainObject(current?.custom_attributes)
        ? current.custom_attributes
        : {};

    const finalAA =
        "additional_attributes" in top
            ? (mergeAdditional
                ? { ...currentAA, ...top.additional_attributes }
                : top.additional_attributes)
            : undefined;

    const finalCA =
        "custom_attributes" in top
            ? (mergeCustom ? { ...currentCA, ...top.custom_attributes } : top.custom_attributes)
            : undefined;

    const payload = cleanDeep({
        name: top.name,
        email: top.email,
        identifier: top.identifier,
        phone_number: top.phone_number,
        avatar_url: top.avatar_url,
        additional_attributes: finalAA,
        custom_attributes: finalCA,
    });

    // 6) PATCH e depois GET para retornar o estado final
    await crm.http.patch(url, payload);
    const fixed = await crm.http.get(url);
    return fixed;
}

/**
 * Exclui um contato pelo ID.
 * - Usa delRaw/getRaw quando disponíveis (status real do Axios).
 * - Se não houver RAW, simula status 200 no sucesso (wrappers retornam .data).
 * - Trata 404 no DELETE como sucesso quando okOn404=true (já deletado).
 * - verify=true: SEMPRE faz GET depois; se 404 → verified:true.
 *
 * 
 * @example
 * // Delete simples
 * const contatoExcluido1 = await services.chatwoot.contact.deleteContact(5);
 * console.log('contatoExcluido1 ->', contatoExcluido1);
 *
 * // Delete com confirmação GET (Espera um 404 para ter certeza de que realmente foi deletado)
 * const contatoExcluido2 = await services.chatwoot.contact.deleteContact(6, { verify: true });
 * console.log('contatoExcluido2 ->', contatoExcluido2);
 *
 * // Em caso de receber um 404 ao invés de dizer "Já estava excluído" ele vai retornar erro
 * const contatoExcluido3 = await services.chatwoot.contact.deleteContact(5, { okOn404: false}); // Aqui vai dar um PUTA ERRO GIGANTE se o contato já tiver sido excluído
 * console.log('contatoExcluido3 ->', contatoExcluido3); // Além de que também vai parar o código se der erro
 * @param {number|string} contactId
 * @param {object} [opts]
 * @param {boolean} [opts.verify=false]   Se true, faz GET depois; 404 ⇒ verified:true
 * @param {boolean} [opts.okOn404=true]   Se true, trata 404 no DELETE como sucesso (alreadyDeleted)
 */
export async function deleteContact(
    contactId,
    { verify = false, okOn404 = true } = {}
) {
    const id = String(contactId ?? "").trim();
    if (!id) throw new Error("deleteContact: contactId obrigatório");

    const base = `/api/v1/accounts/${crm.http.accountId}/contacts/${encodeURIComponent(id)}`;

    // ---- shims para RAW ou wrappers data ----
    const httpDeleteRaw = crm.http.delRaw
        ? (url) => crm.http.delRaw(url)
        : async (url) => {
            const data = await crm.http.del(url); // retorna .data
            return { status: 200, data };
        };

    const httpGetRaw = crm.http.getRaw
        ? (url) => crm.http.getRaw(url)
        : async (url) => {
            const data = await crm.http.get(url);
            return { status: 200, data };
        };

    // helper p/ extrair status de erro
    const pickStatus = (e) =>
        e?.response?.status ??
        (typeof e?.message === "string" && /HTTP\s+(\d{3})\s/i.test(e.message)
            ? Number(RegExp.$1)
            : undefined);

    try {
        // 1) DELETE
        let delStatus = 200;
        let delData;

        try {
            const delRes = await httpDeleteRaw(base);
            delStatus = delRes?.status ?? 200;
            delData = delRes?.data;
        } catch (delErr) {
            const s = pickStatus(delErr);
            if (s === 404 && okOn404) {
                delStatus = 404; // já estava deletado
            } else {
                throw delErr; // erro real (401/403/500…)
            }
        }

        // 2) VERIFY opcional — SEMPRE faz o GET se verify=true (mesmo se DELETE deu 404)
        if (verify) {
            try {
                await httpGetRaw(base);
                // GET achou o contato ⇒ estranho após delete, mas relatamos
                return { ok: false, status: delStatus, verified: false };
            } catch (getErr) {
                const s = pickStatus(getErr);
                if (s === 404) {
                    // sumiu mesmo
                    const out = { ok: true, status: delStatus, verified: true };
                    if (delStatus === 404) out.alreadyDeleted = true;
                    return out;
                }
                throw getErr;
            }
        }

        // 3) Sem verify
        if (delStatus === 404) {
            return { ok: true, status: delStatus, alreadyDeleted: true };
        }
        return { ok: true, status: delStatus, payload: delData };
    } catch (err) {
        const status = err?.response?.status;
        console.error(
            "Chatwoot deleteContact error:",
            status,
            err?.response?.data || err?.message
        );
        throw err;
    }
}
