const allowed = new Set(['HOME','PATH','USER','LOGNAME','XDG_RUNTIME_DIR','DOCKER_HOST','SANDGOD_SUPABASE_SECRET_KEY','SANDGOD_ENABLE_SOURCE_EVAL','SANDGOD_ARTIFACT_DIR','SANDGOD_LOCAL_MODEL_APP','PORT']);
for (const name of Object.keys(process.env)) if (!allowed.has(name)) delete process.env[name];
if (!['server','worker'].includes(process.argv[2])) throw Error('未知服务');
require('../dist/src/' + process.argv[2] + '.js');
