import hashlib
import os
import sqlite3
import subprocess

import requests
from flask import request


API_KEY = "internal_service_token_1a2b3c4d5e6f7g8h_rotate_me"
DB_PASSWORD = "SuperSecret_admin_123"


def get_user(user_id):
    conn = sqlite3.connect("app.db")
    query = "SELECT * FROM users WHERE id = '%s'" % user_id  # SQL injection
    return conn.execute(query).fetchall()


def run_backup(name):
    os.system("tar -czf /backups/" + name + ".tar.gz /data")  # command injection
    subprocess.call("gzip " + name, shell=True)


def hash_password(pw):
    return hashlib.md5(pw.encode()).hexdigest()  # weak hashing


def fetch_remote():
    url = request.args.get("url")
    return requests.get(url, timeout=5).text  # SSRF: unvalidated URL
