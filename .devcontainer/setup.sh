mkdir ~/.hydro
echo '["@hydrooj/ui-default"]' > ~/.hydro/addon.json
# the following config refers to a local mongodb instance.
# before you run this application, please ensure you have a mongo instance read at this port
echo '{"uri": "mongodb://admin:admin@localhost:27017/hydro?authSource=admin"}' > ~/.hydro/config.json