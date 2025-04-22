const sql = require('mssql');

const dbConfig = {
    user: 'sa_tranuoc',
    password: 'Ptc@Tr@nuoc2024#',
    server: '192.168.55.230',       
    database: 'PT_TraNuoc',
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    port: 1433
};

module.exports = dbConfig;
