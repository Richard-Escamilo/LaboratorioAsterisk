#!/bin/bash
set -e
for tpl in /etc/asterisk/*.template; do
  [ -e "$tpl" ] || continue
  envsubst '${PUBLIC_IP} ${LOCAL_NET} ${RTP_START} ${RTP_END} ${AMI_PASSWORD}' < "$tpl" > "${tpl%.template}"
  echo "[render] -> ${tpl%.template}"
done
exec /usr/local/bin/entrypoint.sh "$@"
