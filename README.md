# request headers

The public key is required for every request. Set the `x-smartchat-key` in the header the value of the public key. 

For requests need authorization, the access token need set in the header with key `Authorization` and value `Bearer ${accessToken}`(e.x., `Bearer cb409bce-fdff-488b-9173-5332a06c683d`)

# Documentation sync

The API and database documentation lives on http://palmdrive.github.io/smartChat-service. They are written with [apidoc](http://apidocjs.com/) and host using Github pages. The database doc locates in `routes/api/db-structure.js`. Branch *db-doc* is delicated to the db doc changes. So if wanna make changes in the db doc, checkout db-doc branch first.

In the first time, need run 
```
npm install
```
to install all the node dependencies. Every time after you make changes in the db-doc branch and commit, do the following to sync up your changes: 
```
./deploy_doc.sh
```

You may need give permission to the deploy_doc.sh by executing:
```
sudo chmod 777 deploy_doc.sh
```

# Hack sequelize-cli.js

Because of the utf8mb4 charset, each character is up to 4 instead of 3 bytes. The default string is 255 chars. Under InnoDB, it will exceed the stated prefix limitation which is 767. 

Currently there is no way to configure the storageOption.columnType in sequelize-cli. Manually change this in the getMigrator function in the db.js in sequelize-cli package:

```
var storageOptions = helpers.umzug.getStorageOptions(type, { 
  sequelize: sequelize,
  columnType: Sequelize.STRING(190)
});
// Use the storageOptions in the migrator initialization
```
