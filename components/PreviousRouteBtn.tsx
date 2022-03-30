import { ChevronLeftIcon } from '@heroicons/react/solid'
import useRouterHistory from '@hooks/useRouterHistory'
import Link from 'next/link'
import React from 'react'

const PreviousRouteBtn = () => {
  const { getLastRoute } = useRouterHistory()
  const lastUrl = getLastRoute() as string
  return lastUrl ? (
    <Link href={lastUrl ? lastUrl : ''}>
    </Link>
  ) : null
}
export default PreviousRouteBtn
