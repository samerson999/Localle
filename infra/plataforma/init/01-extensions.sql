-- Executado só na criação do volume (primeira subida do container).
create extension if not exists timescaledb;
create extension if not exists postgis;
