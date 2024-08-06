const mysql = require("mysql2");
const nodemailer = require("nodemailer");
const fs = require("fs");
const handlebars = require("handlebars");
require("dotenv").config();

// Criação do pool de conexões
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: 10,
});

const transporter = nodemailer.createTransport({
  host: process.env.HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL,
    pass: process.env.PASSWORD,
  },
});

function sendEmail(record, callback) {
  fs.readFile("./template/mailTemplate.html", "utf8", (err, data) => {
    if (err) throw err;

    const template = handlebars.compile(data);
    const htmlToSend = template(record);
    const subject = `Viagem ${record.id}: ${record.km_extra} Km Extra(s) Registrado(s)!`;

    const mailOptions = {
      from: "frota@transfurtado.com.br",
      to: "frota@transfurtado.com.br",
      subject: subject,
      html: htmlToSend,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        callback(error);
      } else {
        console.log("E-mail enviado: " + info.response);
        callback(null, record.id);
      }
    });
  });
}

function checkForNewRecords() {
  pool.getConnection((err, connection) => {
    if (err) throw err;

    const query = `
      SELECT v.id, r.rota, r.hora, 
           date_format(v.data_hora,'%d/%m/%Y %H:%i') as data_hora,
           v.km_chegada, v.km_rodado, v.km_extra, 
           UPPER(v.motivo_km_extra) AS motivo_km_extra, 
           v.litros_leite, v.dif, v.n_produtores, 
           c.placa, m.motorista, v.acompanhante 
    FROM controle_viagens v 
    INNER JOIN rotas r ON v.id_rota = r.id 
    INNER JOIN motoristas m ON v.id_motorista = m.id 
    INNER JOIN veiculos c ON v.id_caminhao = c.id 
    WHERE v.motivo_km_extra IS NOT NULL AND v.email_enviado = FALSE 
    ORDER BY v.data_hora DESC;
    `;

    connection.query(query, (err, results) => {
      connection.release(); // Libera a conexão de volta ao pool
      if (err) throw err;

      results.forEach((record) => {
        sendEmail(record, (error, recordId) => {
          if (!error) {
            pool.getConnection((err, conn) => {
              if (err) throw err;

              const updateQuery = `UPDATE controle_viagens SET email_enviado = 1 WHERE id = ?`;
              conn.query(updateQuery, [recordId], (err, result) => {
                conn.release(); // Libera a conexão de volta ao pool
                if (err) throw err;
                console.log(`Registro ${recordId} marcado como enviado.`);
              });
            });
          }
        });
      });
    });
  });
}

// Define um intervalo para executar a consulta periodicamente (por exemplo, a cada 5 minutos)
setInterval(checkForNewRecords, 300000); // 300000 ms = 5 minutos

// Executa a função imediatamente na inicialização
checkForNewRecords();
