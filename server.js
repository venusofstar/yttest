const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const http = require("http");
const https = require("https");
const { PassThrough } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.raw({ type: "*/*" }));

// =========================
// KEEP-ALIVE AGENTS
// =========================
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 200, keepAliveMsecs: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200, keepAliveMsecs: 30000 });

// =========================
// ORIGINS
// =========================
const ORIGINS = [
  "http://143.44.136.67:6060",
  "http://136.239.158.18:6610"
];

// =========================
// AUTH INFO PER CHANNEL
// =========================
const AuthInfo = {
  "1065": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAosKg8aLji3LHWqHUI%2FwQyJsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1075": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqJxLC59eO5kyq497fsAC7QsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1077": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArHUpvQtyXgWxpVCozt4hcgsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1078": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAq9SZLE5HgafIcQ2VcLQB9EsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1079": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoglCgy7TAZamPXsCV8PgebsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1080": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArHx%2Fyl86rMkFVqtHp1NtQIsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1081": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApTfGIKxFqRM2tu30PzY%2FKksyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1083": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAApiZhzOAmsfItUIS2UHXxD0syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1084": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArVgubraL%2BIHu4fk7y9Ng6RsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1086": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAogpxrMDVv1bZ%2FeMkgHZmwQsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1087": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqHRrK8UUahwItHhKpXgPXKsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1088": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoh0xOsaoSFLqA0PEh9gVjisyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1089": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAo0mldwqx%2BTfpKT3KIgGit9syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1090": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApBCCDeDIJn9rDuWx8BszuXsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1091": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAp8EKxpteUJNLDuI18c3YYNsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1092": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArC5ZD%2FYbS0KSGrFVJUNIMksyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1093": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoLvT86fM74ocVChyFS93HUsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1094": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAplioRPAB6XCf%2FrlkX7xxQZsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1095": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAqx1PFsBS2oDQ%2F0bDb4P2SmsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1096": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqRhIO4pq%2FZNG%2BJhjsEpHHCsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1098": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApC219uqwL0dVmslrkAjamFsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1099": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAq%2FDUoNrO3rJTMQSZlDUFIEsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1103": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAqkZ6SnNx3gh97OtxQ2ygibsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1104": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArqe%2B6z8S0P4H4d709E7gynsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1105": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArJrNGPTxGM8qlI%2FCYICZgnsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1106": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqhARVluhpunJiYdQ%2BUDM8fsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1107": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArA9GNo9at0BwcO0MP5gH5%2BsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1108": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAoD7Jkv0l3sE1jz6821dGRWsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1109": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAp%2BWYKp0pXQLOnfpLMLHi2tsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1110": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMArdyomhJMtr4RuT7a45TbNMsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1111": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMApS6W%2B6YCeAzzWlWVs9TWyRsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1112": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAq0ljLQuLaqTKdgvofK6hc4syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1113": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMArJ%2FmqaM1lrBiCRhhaFxCv%2BsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1143": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMArwAtJC%2BsmBQ5ARU076BdkhsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1144": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoS213aSan0K8PDwf0g%2BPDMsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1145": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqZTKpeZkGzV2we2%2BZ6q6g3syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1146": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAq0bLdlQQxjquEy7BUYBE%2BOsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1147": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAr1gDY5x7IZ%2FDqQTvxeS3W1syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1148": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApXWNNS2TvTF9lR8xvbk1CJsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1149": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAroVo9XMLpd0k2y9rVerSvmsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1150": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAq%2B2uVbDOBwGF5t4YHKR5dbsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1151": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqvuCQC%2BfGfSFGYE2TZKWpbsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1152": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMArQQqEzMGzqacd7xs%2FVYEXbsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1155": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAop4OXrlwmfDc6Bu48vA%2B4AsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1156": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMArZbWy4P3NKKVNXe3wACXZmsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1157": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAr79DvzaC5n7CqXniN8aprYsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1159": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAreKmZs4H3Zuj6jrvRtgmFqsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1160": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAqJiJmfV%2B93mjmGGmqynSohsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1163": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAryoLIe58kvIJKdpTKwmPKnsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1164": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAp6wcBVnnqOi%2FM7rVR2UnT6syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1165": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqH%2B5l99GK8Rg%2FAZvU0C4flsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1166": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAoTcUYwq3PMi%2FTObKiSY6bDsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1174": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAorTFLlVQhyuanlrUuZnA07syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1175": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApQqyrYGvsQGfBZz9lkpM7HsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1176": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqx%2BXO6kYP1duDF0CR%2BT7zbsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1177": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAq3IoTFSryS9b7zI0P4QXhKsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1178": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArybZ3RAQEBSZeKilHKlOj1syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1179": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAow35sHUcBhGBpxqddBGYEnsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1183": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAr64o8Us4Cb76FV%2BmBBNwJ2syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1198": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApEZXvFy78Lv6DKuHrHIWsTsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1201": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoc972%2B9bszPiQPXL2uIItWsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1202": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrXDMAo5DOWlb1sl%2Btaq5YYAtO9QsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1208": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqlmQxeX5pQQsD6mPuD6zGhsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1213": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqVCNWul70O3g%2BsOvpld6kgsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1214": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqvraU%2BA8%2FN%2B6NCam0oBPn1syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1223": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArXm%2BLs%2BN7C0jX0KTEhSJl3syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1234": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAp6sHVPy02nySMqUY2vMm%2BjsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1243": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApbUxUxZzyq5Czg7gUnQAcvsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1244": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAp8jImOa2AKrqwa1m%2FJfhcesyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1248": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApp6yQcv0eXOeLWPg38eVQ3syK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1249": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAr70JxlZHE85iqqUwY%2BlbxPsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1250": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApGbNnk2H5Bi8k4yR%2B9AHGFsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1252": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApnsWBpPBgeEj%2FSfIRshYPE2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1253": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAq7M3KTlp1dzcZcVVxlNmQdsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1254": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApP1%2FTBq4G4yW%2Bysf7XC2GUsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1265": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAq8k274WYPuH9%2FjID6Bh2tQ2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1267": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAr4hyjlpFsJWrmHS5nwWoXTsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1274": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArDV011BfpAq1Gp53oE1jzo2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1283": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAr2cQyuTRlDkHeiqeVidUqqsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1287": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAp%2FXtsBqmRMPVZYpftK4PNzsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1304": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArqmX9tLke4aZIpUgreyOpN2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1305": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApahcUJJEYAxPtEef94INw12%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1306": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAo%2FC8MovT6extWSerXoE9od2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1313": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqw9ZN8%2FlFWTDIEPbxgABCW2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1314": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAp7Iya5QVRTA1RELFN4tQIJ2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1315": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApUjG9Pouw9ZPY2OjOhRVs72%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1324": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqyoB01u%2BQHpxktGNSf54NH2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1327": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoMJQgjeNgI0lKcIWq2Qc672%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1334": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqvvSnkxKfMhap8P4VuFwrV2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1335": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApMs3LsiO6wq83YHtJwM7wV2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1336": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAqhLZBm9kWDyfiRCDGdvX2q2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1337": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApMjcsBWP9w%2FYVgaofn83Oe2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1338": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAquM2DhqYshrFbBoS4HC4mc2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1339": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArIns6uYH1PmyGMLXykGGlJ2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1340": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApqUIe1xo9fgdQj%2FdedKSTy2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1343": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApIEgcDfK9VMvZFzWy7ZaCt2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1344": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApysTfm9HUYOIUKeEg06TC92%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1353": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArJao%2B3Joh62iO894OkSinn2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1406": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMArD3MimqPOP6OVIBIcXmXdD2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1416": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMApiydQwVS6x%2ByI3x6azD4uC2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1476": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoW%2FGpHjyFHp8a%2BLnIfrTUy2%2FjHNuou2Jtxin49X3LQKw%3D%3D",
  "1495": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoKAhSI%2FKriXVjdza0RuOjP2%2FjHNuou2Jtxin49X3LQKw%3D%3D"
};

// =========================
// PER-CHANNEL SESSION
// =========================
const channelSessions = new Map();

function createSession(channelId) {
  const ztecid = `ch0000009099000000${channelId}${Math.floor(Math.random() * 9000 + 1000)}`;
  return {
    originIndex: Math.floor(Math.random() * ORIGINS.length),
    startNumber: 46489952 + Math.floor(Math.random() * 100000) * 6,
    IAS: "RR" + Date.now() + Math.random().toString(36).slice(2, 10),
    userSession: Math.floor(Math.random() * 1e15).toString(),
    ztecid
  };
}

function getSession(channelId) {
  if (!channelSessions.has(channelId)) {
    channelSessions.set(channelId, createSession(channelId));
  }
  return channelSessions.get(channelId);
}

function rotateOrigin(session) {
  session.originIndex = (session.originIndex + 1) % ORIGINS.length;
}

// cleanup every 10 min
setInterval(() => channelSessions.clear(), 10 * 60 * 1000);

// =========================
// FETCH WITH STICKY ORIGIN
// =========================
async function fetchSticky(urlBuilder, req, session) {
  for (let attempt = 0; attempt < ORIGINS.length; attempt++) {
    const origin = ORIGINS[session.originIndex];
    const url = urlBuilder(origin);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        agent: url.startsWith("https") ? httpsAgent : httpAgent,
        headers: {
          "User-Agent": req.headers["user-agent"] || "OTT",
          "Accept": "*/*",
          "Connection": "keep-alive"
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;

    } catch (err) {
      console.error("⚠️ Origin failed:", ORIGINS[session.originIndex], err.message);
      rotateOrigin(session);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  throw new Error("All origins failed");
}

// =========================
// HOME PAGE
// =========================
app.get("/", (_, res) => {
  res.send(`
    <html>
      <head>
        <title></title>
        <style>
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #000;
            font-family: 'Arial', sans-serif;
          }
          h1 {
            font-size: 4rem;
            text-transform: uppercase;
            background: linear-gradient(270deg, red, orange, yellow, green, blue, indigo, violet);
            background-size: 1400% 1400%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: rainbow 10s ease infinite;
          }
          @keyframes rainbow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        </style>
      </head>
      <body>
        <h1></h1>
      </body>
    </html>
  `);
});

// =========================
// DASH/HLS PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0];

  // Block if channel ID is not in AuthInfo
  if (!AuthInfo[channelId]) return res.status(403).send("Channel not authorized");

  const session = getSession(channelId);
  const authToken = AuthInfo[channelId];

  const authParams =
    `JITPDRMType=Widevine` +
    `&virtualDomain=001.live_hls.zte.com` +
    `&m4s_min=1` +
    `&NeedJITP=1` +
    `&isjitp=0` +
    `&startNumber=${session.startNumber}` +
    `&filedura=6` +
    `&ispcode=55` +
    `&IASHttpSessionId=${session.IAS}` +
    `&usersessionid=${session.userSession}` +
    `&ztecid=${session.ztecid}` +
    `&authinfo=${encodeURIComponent(authToken)}`;

  try {
    const upstream = await fetchSticky(origin => {
      const base = `${origin}/001/2/ch0000009099000000${channelId}/`;
      return path.includes("?")
        ? `${base}${path}&${authParams}`
        : `${base}${path}?${authParams}`;
    }, req, session);

    // =========================
    // MPD
    // =========================
    if (path.endsWith(".mpd")) {
      let mpd = await upstream.text();
      const proxyBase = `${req.protocol}://${req.get("host")}/${channelId}/`;

      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/gs, "");
      mpd = mpd.replace(
        /<MPD([^>]*)>/,
        `<MPD$1><BaseURL>${proxyBase}</BaseURL>`
      );

      res.set({
        "Content-Type": "application/dash+xml",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      });

      return res.send(mpd);
    }

    // =========================
    // SEGMENTS
    // =========================
    res.set({
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Connection": "keep-alive"
    });

    const SEGMENT_DURATION = 6000; // ms (filedura=6)
    const PREEMPTIVE_ROTATE = 2000; // rotate 2s before segment ends
    const STALL_LIMIT = 3000; // stall detection

    const proxyStream = new PassThrough();
    proxyStream.pipe(res);

    let lastChunkTime = Date.now();
    let preemptiveRotated = false;

    const stallTimer = setInterval(() => {
      const now = Date.now();

      // ⚡ Preemptive rotation
      if (!preemptiveRotated && now - lastChunkTime >= SEGMENT_DURATION - PREEMPTIVE_ROTATE) {
        console.log("⚡ Preemptive origin rotation before segment end...");
        rotateOrigin(session);
        preemptiveRotated = true;
      }

      // Stall detection
      if (now - lastChunkTime > STALL_LIMIT) {
        console.warn("⚠️ Segment stall detected, rotating origin...");
        try { upstream.body.destroy(); } catch(e) {}
        rotateOrigin(session);
      }
    }, 200);

    upstream.body.on("data", chunk => {
      lastChunkTime = Date.now();
      proxyStream.write(chunk);
    });

    upstream.body.on("end", () => {
      clearInterval(stallTimer);
      proxyStream.end();
    });

    upstream.body.on("error", err => {
      console.warn("⚠️ Stream error, rotating origin...", err.message);
      rotateOrigin(session);
      proxyStream.end();
    });

  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(502).end();
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`✅ DASH/HLS proxy running on port ${PORT}`);
});
