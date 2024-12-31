;; Decentralized Event Ticketing System
;; Description: Smart contract for managing event tickets, sales, and revenue distribution

;; Error Codes
(define-constant ERR-NOT-AUTHORIZED (err u1))
(define-constant ERR-EVENT-NOT-FOUND (err u2))
(define-constant ERR-SOLD-OUT (err u3))
(define-constant ERR-TICKET-NOT-FOUND (err u4))
(define-constant ERR-INVALID-PRICE (err u5))
(define-constant ERR-EVENT-EXPIRED (err u6))
(define-constant ERR-INSUFFICIENT-FUNDS (err u7))
(define-constant ERR-ALREADY-EXISTS (err u8))
(define-constant ERR-TRANSFER-NOT-ALLOWED (err u9))
(define-constant ERR-TICKET-USED (err u10))
(define-constant ERR-REFUND-WINDOW-CLOSED (err u11))