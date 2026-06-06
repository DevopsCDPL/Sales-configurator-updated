import psycopg2
conn = psycopg2.connect('dbname=forgedas_dev user=postgres password=root host=localhost')
cur = conn.cursor()
cur.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='documents'")
for row in cur.fetchall():
    print(row)
