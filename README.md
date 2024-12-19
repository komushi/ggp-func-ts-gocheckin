```
aws dynamodb scan --table-name gocheckin_asset --endpoint-url http://192.168.11.68:8080
```


```
aws dynamodb delete-item --table-name gocheckin_asset --endpoint-url http://192.168.11.68:8080 \
--key '{"hostId": {"S": "rulin"}, "uuid": {"S": "00010010-0001-1020-8000-c479051b6993"}}'
```