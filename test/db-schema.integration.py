import pathlib
import subprocess
import time
import uuid

root = pathlib.Path(__file__).resolve().parent.parent
container = 'sandgod-schema-check-' + uuid.uuid4().hex
files = [
    'arena-schema.sql', 'arena-record-match.sql', 'arena-worker-view.sql', 'arena-rating-api.sql',
    'arena-mcp-queue.sql', 'arena-submission-status.sql', 'arena-rating-jobs.sql',
    'arena-source-reserve.sql', 'arena-mcp-staging-limits.sql', 'arena-source-jobs.sql',
    'arena-source-staging.sql', 'arena-source-errors.sql', 'arena-mcp-retry.sql', 'arena-upload-grace.sql',
    'arena-cleanup-recheck.sql',
]

def sql(text):
    subprocess.run(['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                   input=text, text=True, capture_output=True, check=True)

subprocess.run(['docker', 'run', '-d', '--rm', '--name', container, '--network', 'none',
                '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_PASSWORD=test-only', 'postgres:17'],
               capture_output=True, text=True, check=True)
try:
    for attempt in range(100):
        probe = subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'postgres'], capture_output=True)
        if probe.returncode == 0:
            break
        time.sleep(0.2)
    else:
        raise RuntimeError('数据库测试环境未启动')
    sql('''
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
      GRANT USAGE ON SCHEMA storage TO service_role;
      GRANT SELECT ON storage.objects TO service_role;
    ''')
    for filename in files:
        try:
            sql((root / 'db' / filename).read_text())
        except subprocess.CalledProcessError as error:
            raise RuntimeError(filename + ': ' + error.stderr) from error
    sql('''
      DO $$ BEGIN
        IF has_table_privilege('anon','public.arena_worker_players','select')
           OR has_function_privilege('authenticated','public.arena_finish_rating(uuid,uuid,uuid,boolean)','execute')
           OR has_function_privilege('anon','public.arena_reserve_source(uuid,text,text,text,text,integer)','execute')
        THEN RAISE EXCEPTION 'unexpected public access'; END IF;
      END $$;
    ''')
    print('数据库结构可从空库重建；公开角色不能读取私有选手地址或写入评分。')
finally:
    subprocess.run(['docker', 'stop', container], capture_output=True, check=False)
