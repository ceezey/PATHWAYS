'use client'

import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ParticipantRow {
  id: string
  fullName: string
  program: string
  status: string
}

const rows: ParticipantRow[] = [
  {
    id: 'P-001',
    fullName: 'Ariella Santos',
    program: 'Youth Livelihoods',
    status: 'Active',
  },
  {
    id: 'P-002',
    fullName: 'Daniel Cruz',
    program: 'Cash and Voucher Assistance',
    status: 'Pending Review',
  },
  {
    id: 'P-003',
    fullName: 'Leah Flores',
    program: 'Community Resilience',
    status: 'Imported',
  },
]

const columnHelper = createColumnHelper<ParticipantRow>()

const columns = [
  columnHelper.accessor('id', {
    header: 'Participant ID',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('fullName', {
    header: 'Full name',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('program', {
    header: 'Program',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => info.getValue(),
  }),
]

export const ParticipantTablePreview = () => {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : header.column.columnDef.header?.toString()}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>{cell.getValue() as string}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
