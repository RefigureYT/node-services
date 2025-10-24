import * as services from "../services/index.js";

// services.chatwoot.contact.ping();
// const contacts = await services.chatwoot.contact.getContacts();
// console.log('contacts ->', contacts);

// const searchResult = await services.chatwoot.contact.searchContacts('Novo12312qweq');
// console.log('searchResult ->', searchResult);

// const contato = await services.chatwoot.contact.createContact(
//     1,
//     "Contato para teste 23",
//     "5514996748623@s.whatsapp.net", // Precisa ser um número válido, se não a busca por country falha
//     "https://robohash.org/e323369c9440eb6b7ecdcb83585c78e7?set=set4&bgset=&size=400x400", // ou pode ser null para não enviar o avatar_url
//     undefined, // "Jaú", // Cidade
//     {
//         email: "contato2392277@jaupesca.com.br",
//         // country: "Brazil", // Não precisa enviar porque o código identifica automaticamente por meio do DDI
//         // country_code: "BR",
//         socials: { 
//             instagram: "https://instagram.com/jaupesca", // Pode ser tanto URL
//             facebook: "https://web.facebook.com/jaupesca.oficial",
//             linkedin: "jaupesca", // Como também só o username
//             twitter: "jaupesca_oficial", // A função vai normalizar
//             github: "jaupesca"
//         },
//         bio: "Este é um contato de teste criado via API.", // Não é obrigatório
//         company_name: "Empresa Exemplo Ltda", // Não é obrigatório
//         custom: { // Só se você tiver adicionado custom attributes no painel (Configurações -> Atributos Personalizados)
//             favorite_color: "blue",
//             customer_since: "2023-01-15"
//         }
//     }
// );

// const contatoEditado = await services.chatwoot.contact.updateContact(
//     1,
//     {
//         name: "Felipe nelson",
//         city: "Ponto da uva",
//         bio: "Bio atualizada via API em " + new Date().toISOString(),
//         social_profiles: { instagram: "https://instagram.com/felipe.nelson" },
//     }
// );
// console.log('contatoEditado ->', contatoEditado);

// Delete simples
const contatoExcluido1 = await services.chatwoot.contact.deleteContact(5);
console.log('contatoExcluido1 ->', contatoExcluido1);

// Delete com confirmação GET (Espera um 404 para ter certeza de que realmente foi deletado)
const contatoExcluido2 = await services.chatwoot.contact.deleteContact(6, { verify: true });
console.log('contatoExcluido2 ->', contatoExcluido2);

// Em caso de receber um 404 ao invés de dizer "Já estava excluído" ele vai retornar erro
const contatoExcluido3 = await services.chatwoot.contact.deleteContact(5, { okOn404: false});
console.log('contatoExcluido3 ->', contatoExcluido3);