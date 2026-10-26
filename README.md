# Pengembangan Sistem Monitoring dan Peringatan Dini Tingkat Bau di Tempat Pembuangan Sampah Menggunakan Sensor Gas Cerdas Berbasis Kecerdasan Buatan

## Deskripsi

SMART-TPS empat *node* mengembangkan SMART-TPS satu *node* sebelumnya. Empat *node* dipasang di titik berbeda di sekitar TPS. Tiap *node* membaca 9 sensor gas MQ serta suhu dan kelembapan, lalu mengirim datanya ke *server* melalui MQTT. *Server* menentukan tingkat bau tiap *node* (**rendah / sedang / tinggi**) berdasarkan *centroid* K-Means terdekat. Hasilnya ditampilkan di *dashboard web* dan aplikasi *mobile*, dan notifikasi dikirim melalui n8n.

## Tim

| Nama | Peran |
| --- | --- |
| Intan Nabila | Project Manager |
| Wahyu Tirta Wardana | Hardware & Firmware |
| Naufal Alfathan Hafizh | Backend & Cloud |
| Ragil Afda Tripradana | AI / Data |
| Arya Sheva Putra Wijaya | Frontend Web & Mobile |
