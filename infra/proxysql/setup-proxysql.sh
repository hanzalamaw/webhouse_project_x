#!/usr/bin/env bash
# Bootstrap ProxySQL on a Debian/Ubuntu GCE e2-micro VM.
# Run once after creating the VM in the same VPC as Cloud SQL.
#
# Usage:
#   export CLOUD_SQL_PRIVATE_IP=10.x.x.x
#   export PROXYSQL_APP_USER=webhouse_app
#   export PROXYSQL_APP_PASSWORD='...'
#   export PROXYSQL_ADMIN_PASSWORD='...'
#   sudo bash setup-proxysql.sh

set -euo pipefail

CLOUD_SQL_PRIVATE_IP="${CLOUD_SQL_PRIVATE_IP:?Set CLOUD_SQL_PRIVATE_IP}"
PROXYSQL_APP_USER="${PROXYSQL_APP_USER:-webhouse_app}"
PROXYSQL_APP_PASSWORD="${PROXYSQL_APP_PASSWORD:?Set PROXYSQL_APP_PASSWORD}"
PROXYSQL_ADMIN_PASSWORD="${PROXYSQL_ADMIN_PASSWORD:?Set PROXYSQL_ADMIN_PASSWORD}"
MYSQL_MAX_CONNECTIONS="${MYSQL_MAX_CONNECTIONS:-50}"

apt-get update
apt-get install -y proxysql

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/proxysql.cnf" /etc/proxysql.cnf

sed -i "s/10.0.0.0/${CLOUD_SQL_PRIVATE_IP}/" /etc/proxysql.cnf
sed -i "s/CHANGE_ME_APP_PASSWORD/${PROXYSQL_APP_PASSWORD//\//\\/}/" /etc/proxysql.cnf
sed -i "s/CHANGE_ME_ADMIN_PASSWORD/${PROXYSQL_ADMIN_PASSWORD//\//\\/}/" /etc/proxysql.cnf
sed -i "s/username=\"webhouse_app\"/username=\"${PROXYSQL_APP_USER}\"/" /etc/proxysql.cnf
sed -i "s/mysql-max_connections=50/mysql-max_connections=${MYSQL_MAX_CONNECTIONS}/" /etc/proxysql.cnf

systemctl enable proxysql
systemctl restart proxysql

echo "ProxySQL listening on :6033 (frontend) and :6032 (admin)."
echo "Point Cloud Run DB_HOST at this VM's internal IP, DB_PORT=6033, DB_CONNECT_MODE=tcp."
