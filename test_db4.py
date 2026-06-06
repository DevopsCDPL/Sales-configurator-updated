import psycopg2
conn = psycopg2.connect('dbname=forgedas_dev user=postgres password=root host=localhost')
cur = conn.cursor()
cur.execute("SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='configurator_quotations'")
for row in cur.fetchall():
    print(row)
