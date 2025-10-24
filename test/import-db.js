import { conectarAoBanco } from '../services/postgres/database-psql.service.js';
import { executarQueryInDb } from '../services/postgres/database-psql.service.js';
import { listSchemas } from '../services/postgres/database-psql.service.js';
import { listTablesBySchema } from '../services/postgres/database-psql.service.js';


if (!(await conectarAoBanco())) {
    console.error('Erro durante a conexão com o banco.');
    process.exit(1);
}

const unused = ['information_schema', 'pg_catalog', 'pg_toast'];
const schemas = await listSchemas().filter(s => !unused.includes(s.schema));

console.log(schemas);
console.log(await listTablesBySchema('tokens'));
console.log('SUCESSO!');
process.exit(0);