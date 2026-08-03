import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

/**
 * Dynamic QRIS generator (EMV QR Code standard, QRIS Merchant Presented Mode).
 *
 * Converts a STATIC QRIS (from GoPay Merchant scan/export) into a DYNAMIC QRIS
 * with a specific transaction amount, following the EMV QR Code TLV format used
 * by QRIS (Bank Indonesia / ASPI).
 *
 * Important TLV tags:
 *   00 - Payload Format Indicator
 *   01 - Point of Initiation Method (11 = static, 12 = dynamic)
 *   54 - Transaction Amount
 *   63 - CRC16 checksum (must be last & recalculated whenever payload changes)
 *
 * CRC uses CRC-16/CCITT-FALSE, poly 0x1021, init 0xFFFF.
 */
export interface TLVField {
  tag: string;
  length: number;
  value: string;
}

@Injectable()
export class QrisService {
  /** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF) → 4-digit HEX uppercase. */
  crc16ccitt(str: string): string {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /** Parse EMV QR payload into a list of {tag, length, value} preserving order. */
  parseTLV(payload: string): TLVField[] {
    const fields: TLVField[] = [];
    let i = 0;
    while (i < payload.length) {
      const tag = payload.substring(i, i + 2);
      const len = parseInt(payload.substring(i + 2, i + 4), 10);
      const value = payload.substring(i + 4, i + 4 + len);
      fields.push({ tag, length: len, value });
      i += 4 + len;
    }
    return fields;
  }

  buildTLV(fields: TLVField[]): string {
    return fields
      .map((f) => {
        const len = String(f.value.length).padStart(2, '0');
        return `${f.tag}${len}${f.value}`;
      })
      .join('');
  }

  /**
   * Build a dynamic QRIS from a static GoPay Merchant QRIS + transaction amount.
   * @param staticPayload - decoded string of the static QRIS (from GoPay Merchant scan).
   * @param amount - transaction amount (already includes unique code), integer Rupiah.
   * @returns dynamic QRIS payload ready to render as a QR image.
   */
  buildDynamicQris(staticPayload: string, amount: number): string {
    if (!staticPayload || typeof staticPayload !== 'string') {
      throw new Error(
        'QRIS statis kosong/tidak valid. Simpan dulu string QRIS GoPay Merchant di konfigurasi.'
      );
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Nominal transaksi tidak valid');
    }

    let fields = this.parseTLV(staticPayload.trim());

    // Remove old CRC tag (63) — recalculated at the end.
    fields = fields.filter((f) => f.tag !== '63');

    // Set point of initiation method to dynamic (12), tag 01.
    const poiIndex = fields.findIndex((f) => f.tag === '01');
    if (poiIndex >= 0) {
      fields[poiIndex].value = '12';
    } else {
      const insertAt = fields.findIndex((f) => f.tag === '00') + 1;
      fields.splice(insertAt, 0, { tag: '01', value: '12', length: 2 });
    }

    // Insert/update tag 54 (transaction amount).
    const amountStr = String(amount);
    const amountIndex = fields.findIndex((f) => f.tag === '54');
    if (amountIndex >= 0) {
      fields[amountIndex].value = amountStr;
    } else {
      // Tag 54 must come before tag 58 (country code) per EMVCo spec.
      let insertAt = fields.findIndex((f) => f.tag === '58');
      if (insertAt === -1) insertAt = fields.length;
      fields.splice(insertAt, 0, { tag: '54', value: amountStr, length: amountStr.length });
    }

    // Rebuild without CRC, add placeholder tag 63 length 04, compute CRC over
    // the whole string INCLUDING "6304", then append.
    const payloadWithoutCrc = this.buildTLV(fields) + '6304';
    const crc = this.crc16ccitt(payloadWithoutCrc);

    return payloadWithoutCrc + crc;
  }

  /** Extract fields from a QRIS payload (for debugging/admin panel). */
  inspectQris(payload: string): TLVField[] {
    return this.parseTLV(payload.trim());
  }

  /**
   * Render a QRIS (or any EMV QR) text payload into a scannable PNG image,
   * returned as a `data:image/png;base64,...` URI so it can be dropped
   * straight into an `<img src>` without a separate file/route.
   */
  async toDataUrl(payload: string): Promise<string> {
    if (!payload) throw new Error('Payload QRIS kosong, tidak bisa dirender jadi gambar.');
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 400,
    });
  }
}
